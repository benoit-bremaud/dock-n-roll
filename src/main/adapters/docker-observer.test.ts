import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ContainerSnapshot } from '../domain/types'
import { observeDocker, type DockerObserver } from './docker-observer'
import { FakeDockerDaemon } from './fake-docker-daemon'

async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met in time')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('observeDocker — sequence diagram 06', () => {
  let dir: string
  let daemon: FakeDockerDaemon
  let observer: DockerObserver | undefined
  let snapshots: ContainerSnapshot[][]
  let outages: string[]

  const latest = (): ContainerSnapshot[] => snapshots.at(-1) ?? []
  const stateOf = (id: string): string | undefined => latest().find((c) => c.id === id)?.state
  const start = (): void => {
    observer = observeDocker(
      { socketPath: daemon.socketPath, initialDelayMs: 20, maxDelayMs: 80 },
      { onSnapshot: (containers) => snapshots.push(containers), onUnavailable: (reason) => outages.push(reason) }
    )
  }

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'dock-n-roll-docker-'))
    daemon = new FakeDockerDaemon(join(dir, 'docker.sock'))
    daemon.add({ id: 'web', name: 'app-web-1', status: 'running', health: 'healthy' })
    daemon.add({ id: 'db', name: 'app-db-1', status: 'exited', exitCode: 0 })
    await daemon.start()
    snapshots = []
    outages = []
  })

  afterEach(async () => {
    observer?.stop()
    await daemon.stop()
    rmSync(dir, { recursive: true, force: true })
  })

  it('publishes the full inspected snapshot after the first sync', async () => {
    start()

    await waitFor(() => snapshots.length > 0)
    expect(latest().map((c) => [c.id, c.state, c.health, c.exitCode])).toEqual([
      ['web', 'running', 'healthy', null],
      ['db', 'exited', null, 0]
    ])
  })

  it('subscribes to events before listing containers', async () => {
    start()

    await waitFor(() => snapshots.length > 0)
    expect(daemon.requests.indexOf('/v1.47/events')).toBeLessThan(daemon.requests.indexOf('/v1.47/containers/json'))
  })

  it('does not lose a change that happens between the subscription and the list', async () => {
    daemon.beforeNextList = () => {
      // `web` stops while the list is being taken: its first inspect still says running, and
      // the stop event is only on the stream. Listing before subscribing would miss it.
      const web = daemon.containers.get('web')
      if (web !== undefined) web.statusAfterInspect = 'exited'
      daemon.emit('stop', 'web')
    }
    start()

    await waitFor(() => stateOf('web') === 'exited')
    expect(snapshots[0]?.find((c) => c.id === 'web')?.state).toBe('exited')
  })

  it('re-inspects a container on each status event and drops it on destroy', async () => {
    start()
    await waitFor(() => snapshots.length > 0 && daemon.openStreams === 1)

    const db = daemon.containers.get('db')
    if (db !== undefined) db.status = 'running'
    daemon.emit('start', 'db')
    await waitFor(() => stateOf('db') === 'running')

    daemon.containers.delete('web')
    daemon.emit('destroy', 'web')
    await waitFor(() => latest().every((c) => c.id !== 'web'))
  })

  it('reports the outage and resyncs when the event stream drops, catching changes made meanwhile', async () => {
    start()
    await waitFor(() => snapshots.length > 0 && daemon.openStreams === 1)

    daemon.dropStreams()
    const web = daemon.containers.get('web')
    if (web !== undefined) web.status = 'exited'

    await waitFor(() => outages.length === 1)
    await waitFor(() => stateOf('web') === 'exited' && daemon.openStreams === 1)
  })

  it('keeps retrying with backoff while the daemon is down, then syncs once it is back', async () => {
    await daemon.stop()
    start()

    await waitFor(() => outages.length >= 2)
    expect(snapshots).toEqual([])

    await daemon.start()
    await waitFor(() => snapshots.length > 0)
  })

  it('stops for good: no snapshot, no reconnection after stop()', async () => {
    start()
    await waitFor(() => snapshots.length > 0 && daemon.openStreams === 1)
    observer?.stop()
    const count = snapshots.length

    daemon.dropStreams()
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(snapshots).toHaveLength(count)
    expect(daemon.openStreams).toBe(0)
  })
})
