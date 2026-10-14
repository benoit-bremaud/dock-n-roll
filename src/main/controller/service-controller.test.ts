import { describe, expect, it } from 'vitest'
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
  const resolved = new Map<string, string>()
  const resolveCalls: string[] = []
  const missing = new Set<string>()
  const healthy = new Set<string>()
  const scheduled: (() => void)[] = []

  const deps: ControllerDeps = {
    socketPath: SOCKET,
    pinFilePath: '/home/u/.config/dock-n-roll/services.yaml',
    observeDocker: (options, listener) => {
      expect(options.socketPath).toBe(SOCKET)
      docker = listener
      return { stop: () => undefined }
    },
    openPinFileStore: (_path, onChange) => {
      pinsChanged = onChange
      return Promise.resolve({ current: () => pinFile, close: () => undefined })
    },
    runCompose: (args, options) =>
      new Promise((resolve) => {
        runs.push({ args, options, finish: (result = {}) => {
            resolve({ exitCode: 0, stdout: '', stderr: '', ...result })
          } })
      }),
    resolveProjectName: (dir) => {
      resolveCalls.push(dir)
      return Promise.resolve(resolved.get(dir) ?? null)
    },
    filesExist: (dir) => Promise.resolve(!missing.has(dir)),
    probeHealth: (url) => Promise.resolve(healthy.has(url)),
    schedule: (retry) => {
      scheduled.push(retry)
      return () => undefined
    }
  }
  return {
    deps,
    runs,
    resolved,
    resolveCalls,
    missing,
    healthy,
    scheduled,
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
  const states: ControllerState[] = []
  controller.onChange((state) => states.push(state))
  const row = (id: string) => controller.state().services.find((service) => service.id === id)
  return { f, controller, states, row }
}

describe('createServiceController — one way in, one way out (diagram 07)', () => {
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
      controls: { start: false, stop: true },
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
    expect(controller.state()).toMatchObject({ dockerAvailable: true, dockerReason: null })
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
