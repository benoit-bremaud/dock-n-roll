import { describe, expect, it, vi } from 'vitest'
import type { ComposeResult, RunOptions } from '../adapters/compose-runner'
import type { DockerListener } from '../adapters/docker-observer'
import { composeLabels, container } from '../domain/test-fixtures'
import type { ContainerSnapshot, PinEntry, PinFileResult } from '../domain/types'
import type { ControllerState } from '../../shared/ipc'
import { createServiceController, type ControllerDeps } from './service-controller'

const SOCKET = '/run/test/docker.sock'

interface Run {
  readonly args: readonly string[]
  readonly options: RunOptions
  finish(result?: Partial<ComposeResult>): void
}

/** In-memory stand-ins for the adapters; the domain stays real. */
function fakes() {
  let docker: DockerListener | undefined
  let pinsChanged: ((result: PinFileResult) => void) | undefined
  let pinFile: PinFileResult = { entries: [], errors: [] }
  const runs: Run[] = []
  const notified: [string, string][] = []
  const resolved = new Map<string, string>()
  const resolveCalls: string[] = []
  const missing = new Set<string>()
  const healthy = new Set<string>()
  const scheduled: (() => void)[] = []
  const delays: number[] = []
  const nameRetries: (() => void)[] = []
  const counters = { observerStopped: 0, storeClosed: 0, probesCancelled: 0, filesChecks: 0 }
  /** When set, filesExist answers only when the test releases it. */
  const heldFiles: { release: () => void }[] = []
  let holdFiles = false
  /** When set, resolveProjectName answers only when the test releases it. */
  const heldNames: { release: () => void }[] = []
  let holdNames = false
  let rejectNextRun: Error | undefined
  let rejectNames = false
  const clock = { now: 0 }

  const deps: ControllerDeps = {
    socketPath: SOCKET,
    pinFilePath: '/home/u/.config/dock-n-roll/services.yaml',
    homeDir: '/home/u',
    observeDocker: (options, listener) => {
      expect(options.socketPath).toBe(SOCKET)
      docker = listener
      return {
        stop: () => {
          counters.observerStopped += 1
        }
      }
    },
    openPinFileStore: (_path, onChange) => {
      pinsChanged = onChange
      return Promise.resolve({
        current: () => pinFile,
        close: () => {
          counters.storeClosed += 1
        }
      })
    },
    runCompose: (args, options) =>
      new Promise((resolve, reject) => {
        if (rejectNextRun !== undefined) {
          const error = rejectNextRun
          rejectNextRun = undefined
          reject(error)
          return
        }
        runs.push({ args, options, finish: (result = {}) => {
            resolve({ exitCode: 0, stdout: '', stderr: '', ...result })
          } })
      }),
    resolveProjectName: (dir) => {
      resolveCalls.push(dir)
      if (rejectNames) return Promise.reject(new Error('spawn docker ENOENT'))
      if (!holdNames) return Promise.resolve(resolved.get(dir) ?? null)
      return new Promise((resolve) => {
        heldNames.push({
          release: () => {
            resolve(resolved.get(dir) ?? null)
          }
        })
      })
    },
    filesExist: (dir) => {
      counters.filesChecks += 1
      if (!holdFiles) return Promise.resolve(!missing.has(dir))
      return new Promise((resolve) => {
        heldFiles.push({
          release: () => {
            resolve(!missing.has(dir))
          }
        })
      })
    },
    probeHealth: (url) => Promise.resolve(healthy.has(url)),
    notify: (title, body) => {
      notified.push([title, body])
    },
    now: () => clock.now,
    schedule: (retry, delayMs) => {
      // Name-resolution retries (30 s) are kept apart from health probes (2 s).
      if (delayMs === 30_000) {
        nameRetries.push(retry)
        return () => {
          nameRetries.splice(nameRetries.indexOf(retry), 1)
        }
      }
      scheduled.push(retry)
      delays.push(delayMs)
      return () => {
        counters.probesCancelled += 1
        const index = scheduled.indexOf(retry)
        if (index >= 0) scheduled.splice(index, 1)
      }
    }
  }
  return {
    deps,
    runs,
    notified,
    resolved,
    resolveCalls,
    missing,
    healthy,
    scheduled,
    delays,
    nameRetries,
    counters,
    clock,
    heldFiles,
    holdFiles: (on: boolean) => {
      holdFiles = on
    },
    heldNames,
    rejectNames: () => {
      rejectNames = true
    },
    holdNames: (on: boolean) => {
      holdNames = on
    },
    rejectNextRun: (error: Error) => {
      rejectNextRun = error
    },
    snapshot: (containers: ContainerSnapshot[]) => docker?.onSnapshot(containers),
    dockerDown: (reason: string) => docker?.onUnavailable(reason),
    setInitialPins: (entries: PinEntry[]) => {
      pinFile = { entries, errors: [] }
    },
    changePins: (result: PinFileResult) => pinsChanged?.(result)
  }
}

function pin(overrides: Partial<PinEntry> & { workingDir: string }): PinEntry {
  return { pinned: false, hidden: false, ...overrides }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve))
}

const web = container({ id: 'w', state: 'running', labels: composeLabels('blog', '/srv/blog') })
const webStopped = container({ id: 'w', state: 'exited', exitCode: 137, labels: composeLabels('blog', '/srv/blog') })
const BLOG = '/srv/blog\0blog'

async function controllerWith(setup?: (f: ReturnType<typeof fakes>) => void) {
  const f = fakes()
  setup?.(f)
  const controller = await createServiceController(f.deps)
  await settle()
  const states: ControllerState[] = []
  controller.onChange((state) => states.push(state))
  const row = (id: string) => controller.state().services.find((service) => service.id === id)
  return { f, controller, states, row }
}

describe('createServiceController — one way in, one way out (diagram 07)', () => {
  it('returns before the first recomputation ends, then publishes it (diagram 11)', async () => {
    const f = fakes()
    f.setInitialPins([pin({ workingDir: '/srv/blog', name: 'Blog' })])
    f.holdFiles(true)

    const controller = await createServiceController(f.deps)
    const states: ControllerState[] = []
    controller.onChange((state) => states.push(state))
    expect(controller.state().services).toEqual([])

    await settle()
    expect(states).toEqual([])
    expect(f.heldFiles).toHaveLength(1)
    f.heldFiles.forEach((held) => {
      held.release()
    })
    await settle()
    expect(states.at(-1)?.services.map((service) => service.displayName)).toEqual(['Blog'])
  })

  it('schedules no health probe once disposed during a recomputation', async () => {
    const f = fakes()
    f.setInitialPins([pin({ workingDir: '/srv/blog', healthUrl: 'http://localhost/health' })])
    f.holdFiles(true)
    const controller = await createServiceController(f.deps)
    f.snapshot([web])
    await settle()
    f.heldFiles.shift()?.release()
    await settle()
    expect(f.heldFiles).toHaveLength(1)

    controller.dispose()
    f.heldFiles.shift()?.release()
    await settle()
    expect(f.scheduled).toEqual([])
  })

  it('publishes nothing once disposed during the first recomputation', async () => {
    const f = fakes()
    f.setInitialPins([pin({ workingDir: '/srv/blog', name: 'Blog' })])
    f.holdFiles(true)
    const controller = await createServiceController(f.deps)
    const states: ControllerState[] = []
    controller.onChange((state) => states.push(state))
    await settle()

    controller.dispose()
    f.heldFiles.forEach((held) => {
      held.release()
    })
    await settle()
    expect(states).toEqual([])
  })

  it('derives the rows from the Docker snapshot and the pins', async () => {
    const { f, controller, row } = await controllerWith((setup) => {
      setup.setInitialPins([pin({ workingDir: '/srv/blog', name: 'Blog', url: 'http://localhost:8086/' })])
    })
    f.snapshot([web])
    await settle()

    expect(controller.state().dockerAvailable).toBe(true)
    expect(row(BLOG)).toEqual({
      id: BLOG,
      displayName: 'Blog',
      workingDir: '/srv/blog',
      status: 'on',
      controls: { start: false, stop: true, restart: true },
      hasUrl: true,
      reason: null
    })
  })

  it('reports Docker unavailable, then available again after the next snapshot', async () => {
    const { f, controller } = await controllerWith()
    f.dockerDown('Docker event stream closed')
    await settle()
    expect(controller.state()).toMatchObject({ dockerAvailable: false, dockerReason: 'Docker event stream closed' })

    f.snapshot([web])
    await settle()
    expect(controller.state()).toMatchObject({ dockerAvailable: true, dockerReason: null, homeDir: '/home/u' })
  })

  it('shows pin-file errors without dropping the pins', async () => {
    const { f, controller } = await controllerWith()
    f.changePins({ entries: [pin({ workingDir: '/srv/blog', name: 'Blog' })], errors: ['services.yaml: bad indent at line 3'] })
    f.snapshot([web])
    await settle()

    expect(controller.state().pinErrors).toEqual(['services.yaml: bad indent at line 3'])
    expect(controller.state().services[0]?.displayName).toBe('Blog')
  })

  it('pushes a new state to listeners on every change', async () => {
    const { f, states } = await controllerWith()
    f.snapshot([web])
    await settle()
    f.snapshot([webStopped])
    await settle()

    expect(states.map((state) => state.services[0]?.status)).toEqual(['on', 'off'])
  })
})

describe('start / stop — spec UC1, UC2, ADR-0002', () => {
  it('starts with the domain arguments, in the project dir, on the observed daemon', async () => {
    const { f, controller, row } = await controllerWith()
    f.snapshot([webStopped])
    await settle()

    const done = controller.start(BLOG)
    await settle()
    expect(row(BLOG)?.status).toBe('starting')
    expect(f.runs).toHaveLength(1)
    expect(f.runs[0]?.args).toEqual(['compose', '--project-name=blog', '--project-directory=/srv/blog', '--file=/srv/blog/compose.yaml', 'up', '-d', '--wait', '--wait-timeout=180'])
    expect(f.runs[0]?.options).toMatchObject({ cwd: '/srv/blog', socketPath: SOCKET })

    f.snapshot([web])
    f.runs[0]?.finish()
    await done
    await settle()
    expect(row(BLOG)?.status).toBe('on')
  })

  it('runs a single `up` on a double click', async () => {
    const { f, controller } = await controllerWith()
    f.snapshot([webStopped])
    await settle()

    void controller.start(BLOG)
    await settle()
    void controller.start(BLOG)
    await settle()

    expect(f.runs).toHaveLength(1)
  })

  it('refuses a control the derived status forbids, whatever the caller', async () => {
    const { f, controller } = await controllerWith()
    f.snapshot([web, container({ id: 'x', labels: composeLabels('blog', '/home/u/blog') })])
    await settle()

    await controller.start(BLOG)
    await controller.stop(BLOG)
    await controller.start('no-such-id')

    expect(f.runs).toEqual([])
  })

  it('shows the stderr of a failed `up` on the row, and derives the real status', async () => {
    const { f, controller, row } = await controllerWith()
    f.snapshot([webStopped])
    await settle()

    const done = controller.start(BLOG)
    await settle()
    f.runs[0]?.finish({ exitCode: 1, stderr: 'Error response from daemon: port is already allocated' })
    await done
    await settle()

    expect(row(BLOG)).toMatchObject({ status: 'off', reason: 'Error response from daemon: port is already allocated' })
  })

  it('stops by project label from cwd /', async () => {
    const { f, controller, row } = await controllerWith()
    f.snapshot([web])
    await settle()

    void controller.stop(BLOG)
    await settle()

    expect(row(BLOG)?.status).toBe('stopping')
    expect(f.runs[0]?.args).toEqual(['compose', '--project-name=blog', 'stop'])
    expect(f.runs[0]?.options).toMatchObject({ cwd: '/', socketPath: SOCKET })
  })

  it('keeps the pending start when a never-started pin gets its first container (id change)', async () => {
    const { f, controller } = await controllerWith((setup) => {
      setup.resolved.set('/srv/blog', 'blog')
      setup.setInitialPins([pin({ workingDir: '/srv/blog', pinned: true })])
    })
    f.snapshot([])
    await settle()
    const pinOnlyId = controller.state().services[0]?.id ?? ''
    expect(pinOnlyId).toBe('/srv/blog')

    void controller.start(pinOnlyId)
    await settle()
    f.snapshot([web])
    await settle()

    // Same row, new id, still starting: Start stays disabled, no second `up` is possible.
    expect(controller.state().services[0]).toMatchObject({ id: BLOG, status: 'starting', controls: { start: false, stop: false } })
    await controller.start(BLOG)
    expect(f.runs).toHaveLength(1)
  })
})

describe('restart — UC6, diagram 12', () => {
  it('stops, then ups the service under one pending entry: stopping, then starting, then on', async () => {
    const { f, controller, row } = await controllerWith()
    f.snapshot([web])
    await settle()

    const done = controller.restart(BLOG)
    await settle()
    expect(row(BLOG)?.status).toBe('stopping')
    expect(f.runs.map((run) => run.args)).toEqual([['compose', '--project-name=blog', 'stop']])

    f.snapshot([webStopped])
    f.runs[0]?.finish()
    await settle()
    expect(row(BLOG)).toMatchObject({ status: 'starting', controls: { start: false, stop: false, restart: false } })
    expect(f.runs[1]?.args).toEqual(['compose', '--project-name=blog', '--project-directory=/srv/blog', '--file=/srv/blog/compose.yaml', 'up', '-d', '--wait', '--wait-timeout=180'])
    expect(f.runs[1]?.options).toMatchObject({ cwd: '/srv/blog', socketPath: SOCKET })

    f.snapshot([web])
    f.runs[1]?.finish()
    await done
    await settle()
    expect(row(BLOG)?.status).toBe('on')
  })

  it('skips the `up` when the stop fails, and shows its stderr', async () => {
    const { f, controller, row } = await controllerWith()
    f.snapshot([web])
    await settle()

    const done = controller.restart(BLOG)
    await settle()
    f.runs[0]?.finish({ exitCode: 1, stderr: 'boom' })
    await done
    await settle()

    expect(f.runs).toHaveLength(1)
    expect(row(BLOG)).toMatchObject({ status: 'on', reason: 'boom', controls: { restart: true } })
  })

  it('refuses a start or stop clicked between the stop and the `up`', async () => {
    const { f, controller } = await controllerWith()
    f.snapshot([web])
    await settle()

    void controller.restart(BLOG)
    await settle()
    f.snapshot([webStopped])
    f.runs[0]?.finish()
    await settle()
    await controller.start(BLOG)
    await controller.stop(BLOG)

    expect(f.runs.map((run) => run.args.at(-1))).toEqual(['stop', '--wait-timeout=180'])
    expect(f.runs).toHaveLength(2)
  })

  it('clears the pending restart and shows the error when the runner throws', async () => {
    const { f, controller, row } = await controllerWith()
    f.snapshot([web])
    await settle()

    f.rejectNextRun(new Error('socket gone'))
    await controller.restart(BLOG)
    await settle()

    expect(f.runs).toEqual([])
    expect(row(BLOG)).toMatchObject({ status: 'on', reason: 'socket gone', controls: { stop: true, restart: true } })
  })

  it('probes the healthUrl again after a restart, even when Docker never showed it down', async () => {
    const { f, controller, row } = await controllerWith((setup) => {
      setup.setInitialPins([pin({ workingDir: '/srv/blog', healthUrl: 'http://localhost/health' })])
      setup.healthy.add('http://localhost/health')
    })
    f.snapshot([web])
    await settle()
    f.scheduled.shift()?.()
    await settle()
    expect(row(BLOG)?.status).toBe('on')

    const done = controller.restart(BLOG)
    await settle()
    f.runs[0]?.finish()
    await settle()
    f.healthy.clear()
    f.runs[1]?.finish()
    await done
    await settle()

    expect(row(BLOG)?.status).toBe('starting')
    expect(f.scheduled).toHaveLength(1)
  })

  it('runs no `up` when the folder disappeared during the stop, and shows it missing', async () => {
    const { f, controller, row } = await controllerWith()
    f.snapshot([web])
    await settle()

    const done = controller.restart(BLOG)
    await settle()
    f.missing.add('/srv/blog')
    f.snapshot([webStopped])
    f.runs[0]?.finish()
    await done
    await settle()

    expect(f.runs).toHaveLength(1)
    expect(row(BLOG)).toMatchObject({ status: 'missing', reason: 'folder or compose file is missing' })
  })

  it('runs no `up` when Docker became unavailable during the stop', async () => {
    const { f, controller } = await controllerWith()
    f.snapshot([web])
    await settle()

    const done = controller.restart(BLOG)
    await settle()
    f.dockerDown('connect ENOENT')
    f.runs[0]?.finish()
    await done

    expect(f.runs).toHaveLength(1)
  })

  it('runs no `up` when disposed during the stop', async () => {
    const { f, controller } = await controllerWith()
    f.snapshot([web])
    await settle()

    const done = controller.restart(BLOG)
    await settle()
    controller.dispose()
    f.runs[0]?.finish()
    await done

    expect(f.runs).toHaveLength(1)
  })

  it('shows the stderr of a failed `up` after a successful stop', async () => {
    const { f, controller, row } = await controllerWith()
    f.snapshot([web])
    await settle()

    const done = controller.restart(BLOG)
    await settle()
    f.snapshot([webStopped])
    f.runs[0]?.finish()
    await settle()
    f.runs[1]?.finish({ exitCode: 1, stderr: 'port is already allocated' })
    await done
    await settle()

    expect(row(BLOG)).toMatchObject({ status: 'off', reason: 'port is already allocated' })
  })

  it('refuses a restart of a stopped service, and runs a single one on a double click', async () => {
    const { f, controller } = await controllerWith()
    f.snapshot([webStopped])
    await settle()
    await controller.restart(BLOG)
    expect(f.runs).toEqual([])

    f.snapshot([web])
    await settle()
    const first = controller.restart(BLOG)
    void controller.restart(BLOG)
    await settle()
    f.runs[0]?.finish()
    await settle()
    f.runs[1]?.finish()
    await first
    await settle()
    expect(f.runs.map((run) => run.args.at(-1))).toEqual(['stop', '--wait-timeout=180'])
  })
})

describe('crash notifications — UC3 extension 3b, diagram 13', () => {
  const crashed = container({ id: 'w', state: 'exited', exitCode: 1, labels: composeLabels('blog', '/srv/blog') })

  it('notifies a listed service whose running container crashed, with the service name', async () => {
    const { f, row } = await controllerWith()
    f.snapshot([web])
    await settle()

    f.snapshot([crashed])
    await settle()

    expect(f.notified).toEqual([[row(BLOG)?.displayName, 'app-web-1 exited with code 1']])
  })

  it('stays silent for a service the developer is stopping or restarting', async () => {
    const { f, controller } = await controllerWith()
    f.snapshot([web])
    await settle()

    void controller.stop(BLOG)
    await settle()
    f.snapshot([crashed])
    await settle()

    expect(f.notified).toEqual([])
  })

  it('stays silent on the first snapshot after Docker came back', async () => {
    const { f } = await controllerWith()
    f.snapshot([web])
    await settle()

    f.dockerDown('connect ENOENT')
    f.snapshot([crashed])
    await settle()

    expect(f.notified).toEqual([])
  })

  it('notifies at most once per service per minute', async () => {
    const { f } = await controllerWith()
    f.snapshot([web])
    await settle()

    f.snapshot([crashed])
    f.snapshot([web])
    f.clock.now = 59_999
    f.snapshot([crashed])
    f.snapshot([web])
    f.clock.now = 60_000
    f.snapshot([crashed])
    await settle()

    expect(f.notified).toHaveLength(2)
  })

  it('ignores containers that belong to no listed service', async () => {
    const { f } = await controllerWith()
    f.snapshot([container({ id: 'x' })])
    await settle()

    f.snapshot([container({ id: 'x', state: 'exited', exitCode: 1 })])
    await settle()

    expect(f.notified).toEqual([])
  })
})

describe('inputs that need IO — spec §3, §4, §10 P1', () => {
  it('resolves the real Compose name of pins without project, and flags the conflict it reveals', async () => {
    const { f, controller } = await controllerWith((setup) => {
      setup.resolved.set('/home/u/sonarqube-stack', 'sonarqube')
    })
    f.snapshot([container({ id: 's', labels: composeLabels('sonarqube', '/home/u/dev-infra/sonarqube') })])
    f.changePins({ entries: [pin({ workingDir: '/home/u/sonarqube-stack' }), pin({ workingDir: '/srv/x', project: 'x' })], errors: [] })
    await settle()

    expect(f.resolveCalls).toEqual(['/home/u/sonarqube-stack'])
    const row = controller.state().services.find((service) => service.workingDir === '/home/u/sonarqube-stack')
    expect(row).toMatchObject({ status: 'conflict', reason: 'project name also used by /home/u/dev-infra/sonarqube' })
  })

  it('shows a project whose folder is gone as missing, with the reason', async () => {
    const { f, controller } = await controllerWith((setup) => {
      setup.missing.add('/srv/blog')
    })
    f.snapshot([web])
    await settle()

    expect(controller.state().services[0]).toMatchObject({ status: 'missing', reason: 'folder or compose file is missing' })
  })

  it('holds a service on starting until its healthUrl answers, probing every 2 s', async () => {
    const { f, row } = await controllerWith((setup) => {
      setup.setInitialPins([pin({ workingDir: '/srv/blog', healthUrl: 'http://localhost:8086/health' })])
    })
    f.snapshot([web])
    await settle()
    expect(row(BLOG)?.status).toBe('starting')
    expect(f.scheduled).toHaveLength(1)

    f.scheduled.shift()?.()
    await settle()
    expect(row(BLOG)?.status).toBe('starting')

    f.healthy.add('http://localhost:8086/health')
    f.scheduled.shift()?.()
    await settle()
    expect(row(BLOG)?.status).toBe('on')
    expect(f.scheduled).toHaveLength(0)
  })

  it('gives the pin URL only, never one coming from the caller', async () => {
    const { f, controller } = await controllerWith((setup) => {
      setup.setInitialPins([pin({ workingDir: '/srv/blog', url: 'http://localhost:8086/' })])
    })
    f.snapshot([web])
    await settle()

    expect(controller.urlOf(BLOG)).toBe('http://localhost:8086/')
    expect(controller.urlOf('/other')).toBeNull()
  })
})

describe('review fixes — races and failures', () => {
  it('runs a single `up` when two clicks arrive in the same tick', async () => {
    const { f, controller } = await controllerWith()
    f.snapshot([webStopped])
    await settle()

    void controller.start(BLOG)
    void controller.start(BLOG)
    void controller.stop(BLOG)
    await settle()

    expect(f.runs).toHaveLength(1)
  })

  it('keeps the running project busy when the pin file is edited during its `up`', async () => {
    const { f, controller, row } = await controllerWith()
    f.snapshot([webStopped])
    await settle()
    void controller.start(BLOG)
    await settle()

    f.changePins({ entries: [pin({ workingDir: '/srv/blog', name: 'Renamed' })], errors: [] })
    await settle()
    await controller.start(BLOG)

    expect(f.runs).toHaveLength(1)
    expect(row(BLOG)).toMatchObject({ displayName: 'Renamed', status: 'starting', controls: { start: false, stop: false } })
  })

  it('does not block another project of the same dir while one project runs a command', async () => {
    const qa1 = container({ id: '1', state: 'exited', exitCode: 0, labels: composeLabels('qa1', '/srv/app') })
    const qa2 = container({ id: '2', state: 'running', labels: composeLabels('qa2', '/srv/app') })
    const { f, controller, row } = await controllerWith()
    f.snapshot([qa1, qa2])
    await settle()

    void controller.start('/srv/app\0qa1')
    await settle()

    expect(row('/srv/app\0qa2')).toMatchObject({ status: 'on', controls: { stop: true } })
    void controller.stop('/srv/app\0qa2')
    await settle()
    expect(f.runs.map((run) => run.args.at(-1))).toEqual(['--wait-timeout=180', 'stop'])
  })

  it('retries a failed name resolution after 30 s instead of refusing until restart', async () => {
    const { f, controller } = await controllerWith((setup) => {
      setup.setInitialPins([pin({ workingDir: '/srv/blog' })])
    })
    f.snapshot([])
    await settle()
    expect(controller.state().services[0]?.controls.start).toBe(false)

    f.resolved.set('/srv/blog', 'blog')
    f.clock.now = 10_000
    f.snapshot([])
    await settle()
    expect(controller.state().services[0]?.controls.start).toBe(false)

    f.clock.now = 30_000
    f.snapshot([])
    await settle()
    expect(controller.state().services[0]?.controls.start).toBe(true)
    expect(f.resolveCalls).toEqual(['/srv/blog', '/srv/blog'])
  })

  it('publishes Docker changes while a name resolution hangs, then applies the name', async () => {
    const { f, controller, row } = await controllerWith((setup) => {
      setup.holdNames(true)
      setup.setInitialPins([pin({ workingDir: '/srv/app' })])
    })

    f.snapshot([web])
    await settle()

    expect(row(BLOG)).toMatchObject({ status: 'on' })
    expect(controller.state().services.find((s) => s.workingDir === '/srv/app')?.controls.start).toBe(false)

    f.resolved.set('/srv/app', 'app')
    for (const held of f.heldNames) held.release()
    await settle()

    expect(controller.state().services.find((s) => s.workingDir === '/srv/app')?.controls.start).toBe(true)
  })

  it('starts no second name resolution while one is running, without blocking the chain', async () => {
    const { f, row } = await controllerWith((setup) => {
      setup.holdNames(true)
      setup.setInitialPins([pin({ workingDir: '/srv/app' })])
    })

    f.changePins({ entries: [pin({ workingDir: '/srv/app' }), pin({ workingDir: '/srv/other' })], errors: [] })
    f.snapshot([web])
    await settle()

    expect(row(BLOG)).toMatchObject({ status: 'on' })
    expect(f.resolveCalls).toEqual(['/srv/app'])

    for (const held of f.heldNames.splice(0)) held.release()
    await settle()

    expect(f.resolveCalls).toEqual(['/srv/app', '/srv/other'])
  })

  it('treats a rejected name resolution as a failure, retried only after 30 s', async () => {
    const { f } = await controllerWith((setup) => {
      setup.rejectNames()
      setup.setInitialPins([pin({ workingDir: '/srv/app' }), pin({ workingDir: '/srv/other' })])
    })

    f.snapshot([])
    await settle()

    expect(f.resolveCalls).toEqual(['/srv/app', '/srv/other'])
  })

  it('retries a failed name resolution after 30 s even when no other input arrives', async () => {
    const { f, controller } = await controllerWith((setup) => {
      setup.setInitialPins([pin({ workingDir: '/srv/blog' })])
    })
    f.snapshot([])
    await settle()
    f.resolved.set('/srv/blog', 'blog')
    f.clock.now = 30_000

    expect(f.nameRetries).toHaveLength(1)
    for (const retry of f.nameRetries.splice(0)) retry()
    await settle()

    expect(controller.state().services[0]?.controls.start).toBe(true)
  })

  it('publishes nothing when a held name resolution ends after dispose', async () => {
    const { f, controller, states } = await controllerWith((setup) => {
      setup.holdNames(true)
      setup.setInitialPins([pin({ workingDir: '/srv/app' })])
    })
    const before = states.length

    controller.dispose()
    f.resolved.set('/srv/app', 'app')
    for (const held of f.heldNames) held.release()
    await settle()

    expect(states).toHaveLength(before)
    expect(f.nameRetries).toEqual([])
  })

  it('clears the pending operation and shows the error when the runner itself throws', async () => {
    const { f, controller, row } = await controllerWith()
    f.snapshot([webStopped])
    await settle()
    f.rejectNextRun(new Error('spawn docker ENOENT'))

    await controller.start(BLOG)
    await settle()

    expect(row(BLOG)).toMatchObject({ status: 'off', controls: { start: true, stop: false }, reason: 'spawn docker ENOENT' })
  })

  it('shows the stderr of a failed stop, and clears the reason on the next operation', async () => {
    const { f, controller, row } = await controllerWith()
    f.snapshot([web])
    await settle()

    const done = controller.stop(BLOG)
    await settle()
    f.runs[0]?.finish({ exitCode: 1, stderr: 'boom' })
    await done
    await settle()
    expect(row(BLOG)).toMatchObject({ status: 'on', reason: 'boom' })

    void controller.stop(BLOG)
    await settle()
    expect(row(BLOG)?.reason).toBeNull()
  })

  it('caps a long stderr in the row reason', async () => {
    const { f, controller, row } = await controllerWith()
    f.snapshot([webStopped])
    await settle()

    const done = controller.start(BLOG)
    await settle()
    f.runs[0]?.finish({ exitCode: 1, stderr: 'x'.repeat(600) })
    await done
    await settle()

    expect(row(BLOG)?.reason).toBe(`…${'x'.repeat(500)}`)
  })

  it('puts the error of a never-started pin on its new row once its id changes', async () => {
    const { f, controller } = await controllerWith((setup) => {
      setup.setInitialPins([pin({ workingDir: '/srv/blog', project: 'blog' })])
    })
    f.snapshot([])
    await settle()
    const done = controller.start('/srv/blog\0blog')
    await settle()
    f.snapshot([webStopped])
    f.runs[0]?.finish({ exitCode: 1, stderr: 'boom' })
    await done
    await settle()

    expect(controller.state().services).toEqual([expect.objectContaining({ id: BLOG, reason: 'boom' })])
  })

  it('disables every control while Docker is unavailable', async () => {
    const { f, controller } = await controllerWith()
    f.snapshot([web])
    await settle()
    f.dockerDown('Docker event stream closed')
    await settle()

    expect(controller.state().services[0]?.controls).toEqual({ start: false, stop: false, restart: false })
    await controller.stop(BLOG)
    expect(f.runs).toEqual([])
  })

  it('disables controls before the first Docker snapshot', async () => {
    const { controller } = await controllerWith((setup) => {
      setup.setInitialPins([pin({ workingDir: '/srv/blog', pinned: true })])
    })

    expect(controller.state().services[0]?.controls).toEqual({ start: false, stop: false, restart: false })
  })

  it('refuses to start a never-started pin whose Compose name could not be resolved', async () => {
    const { f, controller } = await controllerWith((setup) => {
      setup.setInitialPins([pin({ workingDir: '/srv/blog' })])
    })
    f.snapshot([])
    await settle()

    expect(controller.state().services[0]).toMatchObject({ controls: { start: false }, reason: 'Compose project name could not be resolved' })
    await controller.start('/srv/blog')
    expect(f.runs).toEqual([])
  })

  it('always starts a resolved never-started pin under its resolved name', async () => {
    const { f, controller } = await controllerWith((setup) => {
      setup.resolved.set('/srv/blog', 'blog')
      setup.setInitialPins([pin({ workingDir: '/srv/blog' })])
    })
    f.snapshot([])
    await settle()

    void controller.start('/srv/blog')
    await settle()

    expect(f.runs[0]?.args).toEqual(['compose', '--project-name=blog', '--project-directory=/srv/blog', 'up', '-d', '--wait', '--wait-timeout=180'])
  })

  it('resolves each pin dir once, and again only for new dirs', async () => {
    const { f } = await controllerWith((setup) => {
      setup.setInitialPins([pin({ workingDir: '/srv/a' })])
    })
    f.changePins({ entries: [pin({ workingDir: '/srv/a' }), pin({ workingDir: '/srv/b' })], errors: [] })
    await settle()

    expect(f.resolveCalls).toEqual(['/srv/a', '/srv/b'])
  })
})

describe('review fixes — state publication', () => {
  it('serializes recomputations: a slow older one never publishes over a newer one', async () => {
    const { f, controller, states } = await controllerWith()
    f.snapshot([web])
    await settle()
    f.holdFiles(true)
    f.changePins({ entries: [pin({ workingDir: '/srv/blog', name: 'A' })], errors: [] })
    await settle()
    // The recomputation for A is running (its file check is held) when B arrives.
    f.changePins({ entries: [pin({ workingDir: '/srv/blog', name: 'B' })], errors: [] })
    await settle()

    // The recomputation for B waits for A's: no second file check has started.
    expect(f.heldFiles).toHaveLength(1)
    f.heldFiles.shift()?.release()
    await settle()
    f.heldFiles.shift()?.release()
    await settle()

    expect(states.map((state) => state.services[0]?.displayName).slice(-2)).toEqual(['A', 'B'])
    expect(controller.state().services[0]?.displayName).toBe('B')
  })

  it('publishes only when the state changes', async () => {
    const { f, states } = await controllerWith()
    f.snapshot([web])
    await settle()
    f.snapshot([web])
    await settle()

    expect(states).toHaveLength(1)
  })

  it('keeps notifying other listeners when one throws, and honours unsubscribe', async () => {
    const { f, controller } = await controllerWith()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let seen = 0
    controller.onChange(() => {
      throw new Error('bug in a listener')
    })
    const unsubscribe = controller.onChange(() => {
      seen += 1
    })
    f.snapshot([web])
    await settle()
    expect(seen).toBe(1)

    unsubscribe()
    f.snapshot([webStopped])
    await settle()
    expect(seen).toBe(1)
    errors.mockRestore()
  })

  it('keeps the last state when a probe fails, and recomputes on the next input', async () => {
    const { f, controller } = await controllerWith()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    f.snapshot([web])
    await settle()
    f.deps.filesExist = () => Promise.reject(new Error('EACCES'))
    f.snapshot([webStopped])
    await settle()
    expect(controller.state().services[0]?.status).toBe('on')

    f.deps.filesExist = () => Promise.resolve(true)
    f.snapshot([webStopped])
    await settle()
    expect(controller.state().services[0]?.status).toBe('off')
    errors.mockRestore()
  })

  it('ranks reasons: invalid, then conflict, then missing, then the last error', async () => {
    const { f, controller } = await controllerWith((setup) => {
      setup.missing.add('/srv/blog')
    })
    f.snapshot([web, container({ id: 'x', labels: composeLabels('blog', '/home/u/blog') })])
    await settle()

    expect(controller.state().services.find((s) => s.workingDir === '/srv/blog')?.reason).toBe('project name also used by /home/u/blog')
  })

  it('drops the state of services that disappeared', async () => {
    const { f, controller } = await controllerWith((setup) => {
      setup.setInitialPins([pin({ workingDir: '/srv/blog', healthUrl: 'http://localhost/health' })])
    })
    f.snapshot([web])
    await settle()
    expect(f.scheduled).toHaveLength(1)

    f.changePins({ entries: [], errors: [] })
    f.snapshot([])
    await settle()

    expect(controller.state().services).toEqual([])
    expect(f.counters.probesCancelled).toBe(1)
  })
})

describe('review fixes — health gate and dispose', () => {
  it('probes every 2 s, once per service, and not when a container has its own HEALTHCHECK', async () => {
    const { f } = await controllerWith((setup) => {
      setup.setInitialPins([
        pin({ workingDir: '/srv/blog', healthUrl: 'http://localhost/health' }),
        pin({ workingDir: '/srv/own', healthUrl: 'http://localhost/own' })
      ])
    })
    f.snapshot([web, container({ id: 'o', health: 'healthy', labels: composeLabels('own', '/srv/own') })])
    await settle()
    f.snapshot([web, container({ id: 'o', health: 'healthy', labels: composeLabels('own', '/srv/own') })])
    await settle()

    expect(f.delays).toEqual([2000])
  })

  it('resets the gate and cancels the probe when the service stops, and gates again on restart', async () => {
    const { f, row } = await controllerWith((setup) => {
      setup.setInitialPins([pin({ workingDir: '/srv/blog', healthUrl: 'http://localhost/health' })])
      setup.healthy.add('http://localhost/health')
    })
    f.snapshot([web])
    await settle()
    f.scheduled.shift()?.()
    await settle()
    expect(row(BLOG)?.status).toBe('on')

    f.snapshot([webStopped])
    await settle()
    f.healthy.clear()
    f.snapshot([web])
    await settle()

    expect(row(BLOG)?.status).toBe('starting')
    expect(f.scheduled).toHaveLength(1)
  })

  it('cancels a pending probe when the service goes down', async () => {
    const { f } = await controllerWith((setup) => {
      setup.setInitialPins([pin({ workingDir: '/srv/blog', healthUrl: 'http://localhost/health' })])
    })
    f.snapshot([web])
    await settle()
    f.snapshot([webStopped])
    await settle()

    expect(f.counters.probesCancelled).toBe(1)
    expect(f.scheduled).toEqual([])
  })

  it('dispose stops everything: observer, pin file, probes, listeners', async () => {
    const { f, controller, states } = await controllerWith((setup) => {
      setup.setInitialPins([pin({ workingDir: '/srv/blog', healthUrl: 'http://localhost/health' })])
    })
    f.snapshot([web])
    await settle()
    const published = states.length
    const checks = f.counters.filesChecks

    controller.dispose()
    f.snapshot([webStopped])
    await settle()

    expect(f.counters).toMatchObject({ observerStopped: 1, storeClosed: 1, probesCancelled: 1 })
    expect(states).toHaveLength(published)
    expect(f.counters.filesChecks).toBe(checks)
  })
})
