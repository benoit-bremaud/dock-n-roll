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
  stopped: boolean
}

function setup(byService: Record<string, ContainerSnapshot[]> = {}) {
  const follows: Follow[] = []
  const timers: { run: () => void; delayMs: number; cancelled: boolean }[] = []
  const pushes: (LogsState | null)[] = []
  const session = createLogSession({
    containersOf: (id) => byService[id] ?? null,
    follow: (id, listener) => {
      const entry: Follow = { id, listener, stopped: false }
      follows.push(entry)
      return {
        stop: () => {
          entry.stopped = true
        }
      }
    },
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

  it('ignores an unknown service and a close with nothing open', () => {
    const { session, follows, pushes } = setup()

    session.open('nope', null)
    session.close()

    expect(follows).toEqual([])
    expect(pushes).toEqual([])
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
