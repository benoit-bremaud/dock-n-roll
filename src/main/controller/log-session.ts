import { STREAM_ENDED, type LogListener, type LogStream } from '../adapters/docker-logs'
import { appendLogText, MAX_LOG_LINES } from '../domain/log-lines'
import type { ContainerSnapshot } from '../domain/types'
import type { LogsState } from '../../shared/ipc'

// UC7 (diagram 14): the one open logs panel — which container, its last lines, its stream;
// following it again across restarts: diagram 16.

/** A chatty container is pushed at most this often, whole state, so IPC is never flooded. */
export const PUSH_EVERY_MS = 200

export interface LogSessionDeps {
  /** Containers of a listed service; `null` for an unknown id (`ServiceController.containersOf`). */
  containersOf(serviceId: string): readonly ContainerSnapshot[] | null
  /** `sinceMs` (epoch ms, as `now`) asks only the lines written after a previous stream. */
  follow(containerId: string, listener: LogListener, sinceMs?: number): LogStream
  /** Epoch milliseconds (`Date.now`). */
  now(): number
  /** Schedules a push and returns its cancel function. */
  schedule(run: () => void, delayMs: number): () => void
}

export interface LogSession {
  /**
   * `containerId` is used only if it belongs to the service; else its first running container,
   * else its first. An unlisted service ends the panel ("Service no longer listed").
   */
  open(serviceId: string, containerId: string | null): void
  /**
   * Diagram 16: the service's containers may have changed. Refreshes the picker and, when no
   * stream runs, follows a running container again (the one followed before, when it runs).
   */
  refresh(): void
  /** Stops the stream and pushes `null`; nothing when no panel is open. */
  close(): void
  /** Returns the unsubscribe function. */
  onChange(listener: (state: LogsState | null) => void): () => void
}

function pick(containers: readonly ContainerSnapshot[], asked: string | null): ContainerSnapshot | undefined {
  return containers.find((c) => c.id === asked) ?? containers.find((c) => c.state === 'running') ?? containers[0]
}

const UNLISTED = 'Service no longer listed'

/** Separates the runs of a container followed again across a restart. */
export const RESTART_MARKER = '— container restarted —'

function sameList(a: LogsState['containers'], b: readonly ContainerSnapshot[]): boolean {
  return a.length === b.length && b.every((c, i) => c.id === a[i]?.id && c.name === a[i].name)
}

export function createLogSession(deps: LogSessionDeps): LogSession {
  const listeners = new Set<(state: LogsState | null) => void>()
  let state: LogsState | null = null
  let partial = ''
  let stream: LogStream | null = null
  let cancelPush: (() => void) | null = null

  const publish = (): void => {
    cancelPush?.()
    cancelPush = null
    for (const listener of listeners) listener(state)
  }

  const stop = (): void => {
    stream?.stop()
    stream = null
    cancelPush?.()
    cancelPush = null
    partial = ''
  }

  // Diagram 16 memory: when the followed stream last delivered text (or started), epoch ms. Used
  // as `since` on resume: it predates the disconnect, so a fast restart loses no line.
  let lastSeenAt: number | null = null
  // Set once the followed container is seen not running after its stream ended: a stream that
  // failed while the container still runs is not resumed (no re-follow loop).
  let seenDown = false

  const start = (containerId: string, sinceMs?: number): void => {
    lastSeenAt = deps.now()
    // Callbacks of a replaced stream are ignored: `stream` no longer is this one.
    const own: LogStream = deps.follow(
      containerId,
      {
        onText: (text) => {
          if (stream === own) lastSeenAt = deps.now()
          if (stream !== own || state === null) return
          const next = appendLogText(state.lines, partial, text, MAX_LOG_LINES)
          partial = next.partial
          state = { ...state, lines: next.lines }
          cancelPush ??= deps.schedule(publish, PUSH_EVERY_MS)
        },
        onEnd: (reason) => {
          if (stream !== own || state === null) return
          const lines = partial === '' ? state.lines : appendLogText(state.lines, partial, '\n', MAX_LOG_LINES).lines
          state = { ...state, lines, ended: reason }
          stream = null
          partial = ''
          // The daemon closes a follow stream when its container stops: a restart may happen
          // between two snapshots, so no snapshot ever shows it stopped.
          if (reason === STREAM_ENDED) seenDown = true
          publish()
        }
      },
      sinceMs
    )
    stream = own
  }

  const resume = (current: LogsState, containers: readonly ContainerSnapshot[]): void => {
    const running = containers.filter((c) => c.state === 'running')
    const previous = containers.find((c) => c.id === current.containerId)
    // A container still listed is waited for (it may be the one picked by hand); a gone one is
    // replaced by the first running container of the service.
    const chosen = previous === undefined ? running[0] : running.find((c) => c.id === previous.id)
    if (chosen === undefined || (previous !== undefined && !seenDown)) return
    const same = chosen.id === current.containerId
    const lines = current.containerId === null ? current.lines : [...current.lines, RESTART_MARKER].slice(-MAX_LOG_LINES)
    state = { ...current, containerId: chosen.id, lines, ended: null }
    seenDown = false
    start(chosen.id, same && lastSeenAt !== null ? lastSeenAt : undefined)
  }

  return {
    refresh: () => {
      if (state === null || state.ended === UNLISTED) return
      const containers = deps.containersOf(state.serviceId)
      if (containers === null) {
        stop()
        state = { serviceId: state.serviceId, containerId: null, containers: [], lines: [], ended: UNLISTED }
        publish()
        return
      }
      const before = state
      if (!sameList(state.containers, containers)) state = { ...state, containers: containers.map(({ id, name }) => ({ id, name })) }
      // Recorded even while a stream is open: its `onEnd` may arrive after the stop was published.
      if (containers.some((c) => c.id === state?.containerId && c.state !== 'running')) seenDown = true
      if (stream === null) resume(state, containers)
      if (state !== before) publish()
    },
    open: (serviceId, containerId) => {
      const containers = deps.containersOf(serviceId)
      stop()
      lastSeenAt = null
      seenDown = false
      if (containers === null) {
        // Pin removed between the click and the open: the panel says so instead of staying empty.
        state = { serviceId, containerId: null, containers: [], lines: [], ended: UNLISTED }
        publish()
        return
      }
      const chosen = pick(containers, containerId)
      state = {
        serviceId,
        containerId: chosen?.id ?? null,
        containers: containers.map(({ id, name }) => ({ id, name })),
        lines: [],
        ended: chosen === undefined ? 'No container yet' : null
      }
      publish()
      if (chosen !== undefined) start(chosen.id)
    },
    close: () => {
      if (state === null) return
      stop()
      state = null
      publish()
    },
    onChange: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
