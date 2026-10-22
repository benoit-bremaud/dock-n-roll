import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContainerSnapshot } from '../domain/types'
import { observeDocker, type DockerObserver, type DockerObserverOptions } from './docker-observer'
import { FakeDockerDaemon } from './fake-docker-daemon'

async function waitFor(check: () => boolean): Promise<void> {
  await vi.waitFor(() => {
    expect(check()).toBe(true)
  }, { timeout: 3000, interval: 10 })
}

/**
 * Gives something that must NOT happen the time to happen anyway. Only for negative checks: a
 * slow runner can make such a test pass wrongly, never fail wrongly, so it cannot flake red.
 */
async function quietFor(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

describe('observeDocker — sequence diagram 06', () => {
  let dir: string
  let daemon: FakeDockerDaemon
  let observer: DockerObserver | undefined
  let snapshots: ContainerSnapshot[][]
  let outages: string[]

  const latest = (): ContainerSnapshot[] => snapshots.at(-1) ?? []
  const stateOf = (id: string): string | undefined => latest().find((c) => c.id === id)?.state
  const start = (extra: Partial<DockerObserverOptions> = {}, onSnapshot?: (containers: ContainerSnapshot[]) => void): void => {
    observer = observeDocker(
      { socketPath: daemon.socketPath, initialDelayMs: 20, maxDelayMs: 80, ...extra },
      {
        onSnapshot: onSnapshot ?? ((containers) => snapshots.push(containers)),
        onUnavailable: (reason) => outages.push(reason)
      }
    )
  }
  const eventRequests = (): number => daemon.requests.filter((path) => path === '/v1.47/events').length

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

  it('gives up on an event stream whose headers never come, then resyncs', async () => {
    daemon.hangNextEvents = true
    start({ headersTimeoutMs: 50 })

    await waitFor(() => outages.length > 0)
    expect(outages[0]).toMatch(/did not answer/)
    await waitFor(() => snapshots.length > 0)
    expect(outages).toHaveLength(1)
    expect(eventRequests()).toBe(2)
  })

  it('reports no outage when stopped while the event request hangs', async () => {
    daemon.hangNextEvents = true
    start({ headersTimeoutMs: 50 })
    await waitFor(() => eventRequests() === 1)

    observer?.stop()
    await quietFor(150) // 3x the headers timeout
    expect(outages).toEqual([])
  })

  it('keeps an open event stream past the headers timeout', async () => {
    const startedAt = Date.now()
    start({ headersTimeoutMs: 50 })

    await waitFor(() => snapshots.length > 0)
    await quietFor(Math.max(0, startedAt + 150 - Date.now())) // 3x the headers timeout
    expect(outages).toEqual([])
    expect(daemon.openStreams).toBe(1)
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
    // Nothing is published before the buffered events are applied: one exact first snapshot.
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.map((c) => [c.id, c.state])).toEqual([
      ['web', 'exited'],
      ['db', 'exited']
    ])
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

  it('doubles the retry delay up to the maximum, and resets it after a successful sync', async () => {
    await daemon.stop()
    const delays: number[] = []
    start({
      schedule: (retry, ms) => {
        delays.push(ms)
        const timer = setTimeout(retry, 5)
        return () => {
          clearTimeout(timer)
        }
      }
    })
    await waitFor(() => delays.length >= 4)
    expect(delays.slice(0, 4)).toEqual([20, 40, 80, 80])

    await daemon.start()
    await waitFor(() => snapshots.length > 0 && daemon.openStreams === 1)
    const before = delays.length
    daemon.dropStreams()

    await waitFor(() => delays.length > before)
    expect(delays[before]).toBe(20)
  })

  it('stops for good: no snapshot, no reconnection after stop()', async () => {
    start()
    await waitFor(() => snapshots.length > 0 && daemon.openStreams === 1)
    observer?.stop()
    const count = snapshots.length

    daemon.dropStreams()
    await quietFor(200) // past the 20 ms initial retry delay, several times over
    expect(snapshots).toHaveLength(count)
    expect(eventRequests()).toBe(1)
  })

  it('reassembles an event split across chunks and survives a malformed line', async () => {
    start()
    await waitFor(() => snapshots.length > 0 && daemon.openStreams === 1)
    const db = daemon.containers.get('db')
    if (db !== undefined) db.status = 'running'
    daemon.containers.delete('web')
    const startDb = JSON.stringify({ Type: 'container', Action: 'start', Actor: { ID: 'db' } })
    const destroyWeb = JSON.stringify({ Type: 'container', Action: 'destroy', Actor: { ID: 'web' } })

    daemon.emitRaw(startDb.slice(0, 20))
    // Not a negative check: a short pause so the two writes reach the client as separate chunks.
    await new Promise((resolve) => setTimeout(resolve, 20))
    daemon.emitRaw(`${startDb.slice(20)}\nnot json\n${destroyWeb}\n`)

    await waitFor(() => stateOf('db') === 'running' && latest().every((c) => c.id !== 'web'))
    expect(outages).toEqual([])
  })

  it('drops a container whose inspect answers 404, live and during a sync', async () => {
    daemon.beforeNextList = () => {
      // Listed, then gone before its inspect.
      daemon.nextInspectStatus = undefined
      setImmediate(() => daemon.containers.delete('db'))
    }
    daemon.inspectDelayMs = 20
    start()
    await waitFor(() => snapshots.length > 0)
    expect(latest().map((c) => c.id)).toEqual(['web'])

    daemon.containers.delete('web')
    daemon.emit('die', 'web')
    await waitFor(() => latest().length === 0)
    expect(outages).toEqual([])
  })

  it('treats a failed list as an outage, never as an empty snapshot', async () => {
    daemon.nextListStatus = 500
    start()

    await waitFor(() => outages.length === 1)
    expect(snapshots).toEqual([])
    await waitFor(() => latest().length === 2)
  })

  it('treats an inspect cut mid-response as an outage instead of hanging', async () => {
    daemon.cutNextInspect = true
    start()

    await waitFor(() => outages.length === 1)
    await waitFor(() => latest().length === 2)
  })

  it('reports one outage per lost connection and ignores the callbacks of the abandoned one', async () => {
    daemon.nextInspectStatus = 500
    start()

    await waitFor(() => latest().length === 2)
    await quietFor(100) // lets a late callback of the abandoned connection report a 2nd outage
    expect(outages).toHaveLength(1)
    expect(eventRequests()).toBe(2)
  })

  it('publishes once per burst of events instead of once per event', async () => {
    start()
    await waitFor(() => snapshots.length === 1)
    const db = daemon.containers.get('db')
    if (db !== undefined) db.status = 'running'

    daemon.emitBurst([['create', 'web'], ['start', 'web'], ['create', 'db'], ['start', 'db'], ['health_status', 'web']])

    await waitFor(() => stateOf('db') === 'running')
    await quietFor(100)
    expect(snapshots).toHaveLength(2)
  })

  it('still publishes during a long burst, at least every maxBatch events', async () => {
    start({ maxBatch: 3 })
    await waitFor(() => snapshots.length === 1)
    const db = daemon.containers.get('db')
    if (db !== undefined) db.status = 'running'

    daemon.emitBurst([['start', 'web'], ['start', 'web'], ['start', 'web'], ['start', 'web'], ['start', 'web'], ['start', 'db']])

    await waitFor(() => stateOf('db') === 'running')
    await quietFor(100)
    expect(snapshots).toHaveLength(3)
  })

  it('never batches away a container leaving running: a crash then a restart both publish', async () => {
    start()
    await waitFor(() => snapshots.length === 1)
    const web = daemon.containers.get('web')
    if (web !== undefined) {
      web.status = 'exited'
      web.statusAfterInspect = 'running'
    }

    daemon.emitBurst([['die', 'web'], ['start', 'web']])

    await waitFor(() => snapshots.length >= 3)
    expect(snapshots.map((snapshot) => snapshot.find((c) => c.id === 'web')?.state)).toEqual(['running', 'exited', 'running'])
  })

  it('applies a live event that arrives while the buffered flush is still running, in order', async () => {
    daemon.inspectDelayMs = 30
    daemon.beforeNextList = () => {
      const db = daemon.containers.get('db')
      if (db !== undefined) db.statusAfterInspect = 'running'
      daemon.emit('start', 'db')
    }
    start()
    await waitFor(() => snapshots.length > 0)
    const db = daemon.containers.get('db')
    if (db !== undefined) db.status = 'exited'
    daemon.emit('stop', 'db')

    await waitFor(() => stateOf('db') === 'exited' && snapshots.length >= 2)
    expect(snapshots.every((snapshot) => snapshot.some((c) => c.id === 'db'))).toBe(true)
  })

  it('never lets a slow answer of an abandoned connection overwrite the new snapshot', async () => {
    start()
    await waitFor(() => snapshots.length > 0 && daemon.openStreams === 1)

    // Old connection: a re-inspect of `db` (still exited) is in flight for 300 ms…
    daemon.inspectDelayMs = 300
    daemon.emit('start', 'db')
    await waitFor(() => daemon.requests.filter((path) => path.endsWith('/db/json')).length === 2)
    daemon.inspectDelayMs = 0
    // …when `db` really starts and the stream drops: the new sync sees it running.
    const db = daemon.containers.get('db')
    if (db !== undefined) db.status = 'running'
    daemon.dropStreams()
    await waitFor(() => stateOf('db') === 'running' && daemon.openStreams === 1)
    const afterResync = snapshots.length - 1

    // The stale answer lands (third `db` answer: first sync, slow re-inspect, resync); no publish
    // from then on may say `db` is not running.
    await waitFor(() => daemon.answered.filter((path) => path.endsWith('/db/json')).length === 3)
    const published = snapshots.length
    daemon.emit('start', 'web')
    await waitFor(() => snapshots.length > published)
    for (const snapshot of snapshots.slice(afterResync)) {
      expect(snapshot.find((c) => c.id === 'db')?.state).toBe('running')
    }
  })

  it('skips a container whose inspect it cannot read, and keeps observing the others', async () => {
    daemon.add({ id: 'odd', name: 'odd-1', status: 'hibernating' })
    start()

    await waitFor(() => snapshots.length > 0)
    expect(latest().map((c) => c.id)).toEqual(['web', 'db'])
    expect(outages).toEqual([])
  })

  it('keeps observing when the listener throws: a listener bug is not a Docker outage', async () => {
    let calls = 0
    start({}, (containers) => {
      calls += 1
      snapshots.push(containers)
      if (calls === 1) throw new Error('bug in the controller')
    })
    await waitFor(() => snapshots.length === 1 && daemon.openStreams === 1)
    const db = daemon.containers.get('db')
    if (db !== undefined) db.status = 'running'
    daemon.emit('start', 'db')

    await waitFor(() => stateOf('db') === 'running')
    expect(outages).toEqual([])
  })
})
