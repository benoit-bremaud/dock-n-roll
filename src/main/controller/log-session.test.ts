import { describe, expect, it } from 'vitest'
import type { LogListener } from '../adapters/docker-logs'
import { container } from '../domain/test-fixtures'
import type { ContainerSnapshot } from '../domain/types'
import type { LogsState } from '../../shared/ipc'
import { MAX_LOG_LINES } from '../domain/log-lines'
import { createLogSession, PUSH_EVERY_MS } from './log-session'

interface Follow {
  readonly id: string
  readonly listener: LogListener
  readonly since: number | undefined
  stopped: boolean
}

function setup(byService: Record<string, ContainerSnapshot[] | undefined> = {}, clock = { now: 1_000_000 }) {
  const follows: Follow[] = []
  const timers: { run: () => void; delayMs: number; cancelled: boolean }[] = []
  const pushes: (LogsState | null)[] = []
  const session = createLogSession({
    containersOf: (id) => byService[id] ?? null,
    follow: (id, listener, since) => {
      const entry: Follow = { id, listener, since, stopped: false }
      follows.push(entry)
      return {
        stop: () => {
          entry.stopped = true
        }
      }
    },
    now: () => clock.now,
    schedule: (run, delayMs) => {
      const timer = { run, delayMs, cancelled: false }
      timers.push(timer)
      return () => {
        timer.cancelled = true
      }
    }
  })
  session.onChange((state) => pushes.push(state))
  const flush = (): void => {
    for (const timer of timers.splice(0)) if (!timer.cancelled) timer.run()
  }
  return { session, follows, timers, pushes, flush, last: () => pushes.at(-1) }
}

const web = container({ id: 'w', name: 'blog-web-1' })
const db = container({ id: 'd', name: 'blog-db-1' })
const stoppedWeb = container({ id: 'w', name: 'blog-web-1', state: 'exited', exitCode: 0 })

describe('createLogSession — UC7, diagram 14', () => {
  it('follows the first running container of the service and pushes its state at once', () => {
    const { session, follows, last } = setup({ blog: [stoppedWeb, db] })

    session.open('blog', null)

    expect(follows.map((f) => f.id)).toEqual(['d'])
    expect(last()).toEqual({
      serviceId: 'blog',
      containerId: 'd',
      containers: [{ id: 'w', name: 'blog-web-1' }, { id: 'd', name: 'blog-db-1' }],
      lines: [],
      ended: null
    })
  })

  it('falls back to the first container when none runs', () => {
    const { session, follows } = setup({ blog: [stoppedWeb] })

    session.open('blog', null)

    expect(follows.map((f) => f.id)).toEqual(['w'])
  })

  it('follows the asked container only if it belongs to the service', () => {
    const { session, follows } = setup({ blog: [web, db], other: [container({ id: 'x' })] })

    session.open('blog', 'd')
    session.open('blog', 'x')

    expect(follows.map((f) => f.id)).toEqual(['d', 'w'])
  })

  it('says so when the service has no container yet, without opening a stream', () => {
    const { session, follows, last } = setup({ blog: [] })

    session.open('blog', null)

    expect(follows).toEqual([])
    expect(last()).toMatchObject({ serviceId: 'blog', containerId: null, ended: 'No container yet' })
  })

  it('closes the previous stream when another one opens', () => {
    const { session, follows } = setup({ blog: [web], api: [db] })

    session.open('blog', null)
    session.open('api', null)

    expect(follows.map((f) => [f.id, f.stopped])).toEqual([['w', true], ['d', false]])
  })

  it('pushes new lines at most every 200 ms, whole state', () => {
    const { session, follows, timers, pushes, flush, last } = setup({ blog: [web] })
    session.open('blog', null)
    const before = pushes.length

    follows[0]?.listener.onText('one\ntw')
    follows[0]?.listener.onText('o\n')

    expect(pushes).toHaveLength(before)
    expect(timers.map((t) => t.delayMs)).toEqual([PUSH_EVERY_MS])
    flush()
    expect(last()?.lines).toEqual(['one', 'two'])
  })

  it('keeps the last lines only', () => {
    const { session, follows, flush, last } = setup({ blog: [web] })
    session.open('blog', null)

    follows[0]?.listener.onText(Array.from({ length: MAX_LOG_LINES + 5 }, (_, i) => `l${String(i)}\n`).join(''))
    flush()

    expect(last()?.lines).toHaveLength(MAX_LOG_LINES)
    expect(last()?.lines[0]).toBe('l5')
  })

  it('shows the unfinished last line and the reason when the stream ends', () => {
    const { session, follows, last } = setup({ blog: [web] })
    session.open('blog', null)

    follows[0]?.listener.onText('done\nno newline')
    follows[0]?.listener.onEnd('Log stream ended')

    expect(last()).toMatchObject({ lines: ['done', 'no newline'], ended: 'Log stream ended' })
  })

  it('stops the stream, cancels the pending push and pushes null on close', () => {
    const { session, follows, timers, last } = setup({ blog: [web] })
    session.open('blog', null)
    follows[0]?.listener.onText('x\n')

    session.close()

    expect(follows[0]?.stopped).toBe(true)
    expect(timers[0]?.cancelled).toBe(true)
    expect(last()).toBeNull()
  })

  it('ignores a close with nothing open', () => {
    const { session, pushes } = setup()

    session.close()

    expect(pushes).toEqual([])
  })

  it('ends the panel when the service is no longer listed, closing the previous stream', () => {
    const { session, follows, last } = setup({ blog: [web] })
    session.open('blog', null)

    session.open('gone', null)

    expect(follows.map((f) => [f.id, f.stopped])).toEqual([['w', true]])
    expect(last()).toEqual({ serviceId: 'gone', containerId: null, containers: [], lines: [], ended: 'Service no longer listed' })
  })

  it('ignores late callbacks of a replaced stream', () => {
    const { session, follows, flush, last } = setup({ blog: [web], api: [db] })
    session.open('blog', null)
    session.open('api', null)

    follows[0]?.listener.onText('stale\n')
    follows[0]?.listener.onEnd('Log stream ended')
    flush()

    expect(last()).toMatchObject({ serviceId: 'api', lines: [], ended: null })
  })

  it('never prefixes the next container\'s first line with the previous one\'s unfinished line', () => {
    const { session, follows, flush, last } = setup({ blog: [web, db] })
    session.open('blog', 'w')
    follows[0]?.listener.onText('half')

    session.open('blog', 'd')
    follows[1]?.listener.onText('x\n')
    flush()

    expect(last()).toMatchObject({ containerId: 'd', lines: ['x'] })
  })

  it('cancels the pending push of the previous stream on reopen', () => {
    const { session, follows, timers } = setup({ blog: [web] })
    session.open('blog', null)
    follows[0]?.listener.onText('x\n')

    session.open('blog', null)

    expect(timers[0]?.cancelled).toBe(true)
  })

  it('ignores text arriving after the stream ended', () => {
    const { session, follows, flush, last } = setup({ blog: [web] })
    session.open('blog', null)
    follows[0]?.listener.onEnd('Log stream ended')

    follows[0]?.listener.onText('late\n')
    flush()

    expect(last()).toMatchObject({ lines: [], ended: 'Log stream ended' })
  })

  it('drops its listeners on unsubscribe', () => {
    const { session, pushes } = setup({ blog: [web] })
    const seen: unknown[] = []
    const unsubscribe = session.onChange((state) => seen.push(state))
    unsubscribe()

    session.open('blog', null)

    expect(seen).toEqual([])
    expect(pushes).toHaveLength(1)
  })
})

describe('createLogSession — across restarts (diagram 16)', () => {
  const MARKER = '— container restarted —'

  it('resumes the same container when it runs again, after a marker, from the time it ended', () => {
    const byService: Record<string, ContainerSnapshot[]> = { blog: [web] }
    const clock = { now: 1_000_000 }
    const { session, follows, last } = setup(byService, clock)
    session.open('blog', null)
    clock.now = 1_234_500
    follows[0]?.listener.onText('before\n')
    clock.now = 1_300_000
    follows[0]?.listener.onEnd('Log stream ended')
    byService.blog = [stoppedWeb]
    session.refresh()

    byService.blog = [web]
    session.refresh()

    expect(follows.map((f) => [f.id, f.since])).toEqual([['w', undefined], ['w', 1234.5]])
    expect(last()).toMatchObject({ containerId: 'w', lines: ['before', MARKER], ended: null })
  })

  it('follows a recreated container from its whole recent log', () => {
    const byService: Record<string, ContainerSnapshot[]> = { blog: [web] }
    const { session, follows, last } = setup(byService)
    session.open('blog', null)
    follows[0]?.listener.onEnd('Log stream ended')

    byService.blog = [container({ id: 'w2', name: 'blog-web-1' })]
    session.refresh()

    expect(follows.map((f) => [f.id, f.since])).toEqual([['w', undefined], ['w2', undefined]])
    expect(last()).toMatchObject({ containerId: 'w2', containers: [{ id: 'w2', name: 'blog-web-1' }], ended: null })
  })

  it('waits while nothing runs, refreshing the picker', () => {
    const byService: Record<string, ContainerSnapshot[]> = { blog: [web] }
    const { session, follows, last } = setup(byService)
    session.open('blog', null)
    follows[0]?.listener.onEnd('Log stream ended')

    byService.blog = [stoppedWeb, container({ id: 'x', name: 'blog-worker-1', state: 'exited', exitCode: 1 })]
    session.refresh()

    expect(follows).toHaveLength(1)
    expect(last()).toMatchObject({ ended: 'Log stream ended', containers: [{ id: 'w', name: 'blog-web-1' }, { id: 'x', name: 'blog-worker-1' }] })
  })

  it('starts following, without a marker, a service that had no container yet', () => {
    const byService: Record<string, ContainerSnapshot[]> = { blog: [] }
    const { session, follows, last } = setup(byService)
    session.open('blog', null)

    byService.blog = [web]
    session.refresh()

    expect(follows.map((f) => [f.id, f.since])).toEqual([['w', undefined]])
    expect(last()).toMatchObject({ containerId: 'w', lines: [], ended: null })
  })

  it('prefers the container picked by hand when several run again', () => {
    const byService: Record<string, ContainerSnapshot[]> = { blog: [web, db] }
    const { session, follows } = setup(byService)
    session.open('blog', 'd')
    follows[0]?.listener.onEnd('Log stream ended')
    byService.blog = [web, { ...db, state: 'exited' }]
    session.refresh()

    byService.blog = [web, db]
    session.refresh()

    expect(follows.map((f) => f.id)).toEqual(['d', 'd'])
  })

  it('resumes nothing after a close', () => {
    const { session, follows, pushes } = setup({ blog: [web] })
    session.open('blog', null)
    session.close()
    const count = pushes.length

    session.refresh()

    expect(follows).toHaveLength(1)
    expect(pushes).toHaveLength(count)
  })

  it('ends the panel when the service leaves the pin file, stopping the stream', () => {
    const byService: Record<string, ContainerSnapshot[] | undefined> = { blog: [web] }
    const { session, follows, last } = setup(byService)
    session.open('blog', null)

    byService.blog = undefined
    session.refresh()

    expect(follows[0]?.stopped).toBe(true)
    expect(last()).toEqual({ serviceId: 'blog', containerId: null, containers: [], lines: [], ended: 'Service no longer listed' })
  })

  it('pushes nothing when the open service did not change', () => {
    const { session, pushes } = setup({ blog: [web] })
    session.open('blog', null)
    const count = pushes.length

    session.refresh()

    expect(pushes).toHaveLength(count)
  })

  it('does not follow again a stream that failed while its container still runs', () => {
    const { session, follows } = setup({ blog: [web] })
    session.open('blog', null)
    follows[0]?.listener.onEnd('Docker answered 500')

    session.refresh()
    session.refresh()

    expect(follows).toHaveLength(1)
  })

  it('keeps a stopped container picked by hand instead of switching to a running one', () => {
    const { session, follows, last } = setup({ blog: [web, { ...db, state: 'exited' }] })
    session.open('blog', 'd')
    follows[0]?.listener.onEnd('Log stream ended')

    session.refresh()

    expect(follows.map((f) => f.id)).toEqual(['d'])
    expect(last()).toMatchObject({ containerId: 'd', ended: 'Log stream ended' })
  })

  it('remembers a stop published before the stream ended', () => {
    const byService: Record<string, ContainerSnapshot[]> = { blog: [web] }
    const { session, follows } = setup(byService)
    session.open('blog', null)
    byService.blog = [stoppedWeb]
    session.refresh()
    follows[0]?.listener.onEnd('Log stream ended')

    byService.blog = [web]
    session.refresh()

    expect(follows.map((f) => f.id)).toEqual(['w', 'w'])
  })

  it('resumes from the open time when the stream gave no text', () => {
    const byService: Record<string, ContainerSnapshot[]> = { blog: [stoppedWeb] }
    const clock = { now: 2_000_000 }
    const { session, follows } = setup(byService, clock)
    session.open('blog', null)
    session.refresh()
    clock.now = 2_500_000
    follows[0]?.listener.onEnd('Log stream ended')

    byService.blog = [web]
    session.refresh()

    expect(follows.map((f) => [f.id, f.since])).toEqual([['w', undefined], ['w', 2000]])
  })
})
