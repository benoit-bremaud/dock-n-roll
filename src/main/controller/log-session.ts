import type { LogListener, LogStream } from '../adapters/docker-logs'
import { appendLogText, MAX_LOG_LINES } from '../domain/log-lines'
import type { ContainerSnapshot } from '../domain/types'
import type { LogsState } from '../../shared/ipc'

// UC7 (diagram 14): the one open logs panel — which container, its last lines, its stream.

/** A chatty container is pushed at most this often, whole state, so IPC is never flooded. */
export const PUSH_EVERY_MS = 200

export interface LogSessionDeps {
  /** Containers of a listed service; `null` for an unknown id (`ServiceController.containersOf`). */
  containersOf(serviceId: string): readonly ContainerSnapshot[] | null
  /** `since` (Unix seconds) asks only the lines written after a previous stream ended. */
  follow(containerId: string, listener: LogListener, since?: number): LogStream
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

  // Diagram 16 memory: the container last followed, and when its stream ended (epoch ms).
  let endedAt: number | null = null

  const start = (containerId: string, since?: number): void => {
    // Callbacks of a replaced stream are ignored: `stream` no longer is this one.
    const own: LogStream = deps.follow(
      containerId,
      {
        onText: (text) => {
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
          endedAt = deps.now()
          publish()
        }
      },
      since
    )
    stream = own
  }

  const resume = (current: LogsState, containers: readonly ContainerSnapshot[]): void => {
    const running = containers.filter((c) => c.state === 'running')
    const chosen = running.find((c) => c.id === current.containerId) ?? running[0]
    if (chosen === undefined) return
    const same = chosen.id === current.containerId
    const lines = current.containerId === null ? current.lines : [...current.lines, RESTART_MARKER].slice(-MAX_LOG_LINES)
    state = { ...current, containerId: chosen.id, lines, ended: null }
    start(chosen.id, same && endedAt !== null ? endedAt / 1000 : undefined)
  }

  return {
    refresh: () => {
      if (state === null || state.ended === 'Service no longer listed') return
      const containers = deps.containersOf(state.serviceId)
      if (containers === null) {
        stop()
        state = { serviceId: state.serviceId, containerId: null, containers: [], lines: [], ended: 'Service no longer listed' }
        publish()
        return
      }
      const before = state
      if (!sameList(state.containers, containers)) state = { ...state, containers: containers.map(({ id, name }) => ({ id, name })) }
      if (stream === null) resume(state, containers)
      if (state !== before) publish()
    },
    open: (serviceId, containerId) => {
      const containers = deps.containersOf(serviceId)
      stop()
      endedAt = null
      if (containers === null) {
        // Pin removed between the click and the open: the panel says so instead of staying empty.
        state = { serviceId, containerId: null, containers: [], lines: [], ended: 'Service no longer listed' }
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
