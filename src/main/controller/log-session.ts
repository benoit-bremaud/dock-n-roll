import type { LogListener, LogStream } from '../adapters/docker-logs'
import { appendLogText } from '../domain/log-lines'
import type { ContainerSnapshot } from '../domain/types'
import type { LogsState } from '../../shared/ipc'

// UC7 (diagram 14): the one open logs panel — which container, its last lines, its stream.

export const MAX_LINES = 500
/** A chatty container is pushed at most this often, whole state, so IPC is never flooded. */
export const PUSH_EVERY_MS = 200

export interface LogSessionDeps {
  /** Containers of a listed service; `null` for an unknown id (`ServiceController.containersOf`). */
  containersOf(serviceId: string): readonly ContainerSnapshot[] | null
  follow(containerId: string, listener: LogListener): LogStream
  /** Schedules a push and returns its cancel function. */
  schedule(run: () => void, delayMs: number): () => void
}

export interface LogSession {
  /** `containerId` is used only if it belongs to the service; else its first running container. */
  open(serviceId: string, containerId: string | null): void
  /** Stops the stream and pushes `null`; nothing when no panel is open. */
  close(): void
  /** Returns the unsubscribe function. */
  onChange(listener: (state: LogsState | null) => void): () => void
}

function pick(containers: readonly ContainerSnapshot[], asked: string | null): ContainerSnapshot | undefined {
  return containers.find((c) => c.id === asked) ?? containers.find((c) => c.state === 'running') ?? containers[0]
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

  return {
    open: (serviceId, containerId) => {
      const containers = deps.containersOf(serviceId)
      if (containers === null) return
      stop()
      const chosen = pick(containers, containerId)
      state = {
        serviceId,
        containerId: chosen?.id ?? null,
        containers: containers.map(({ id, name }) => ({ id, name })),
        lines: [],
        ended: chosen === undefined ? 'No container yet' : null
      }
      publish()
      if (chosen === undefined) return
      // Callbacks of a replaced stream are ignored: `stream` no longer is this one.
      const own: LogStream = deps.follow(chosen.id, {
        onText: (text) => {
          if (stream !== own || state === null) return
          const next = appendLogText(state.lines, partial, text, MAX_LINES)
          partial = next.partial
          state = { ...state, lines: next.lines }
          cancelPush ??= deps.schedule(publish, PUSH_EVERY_MS)
        },
        onEnd: (reason) => {
          if (stream !== own || state === null) return
          const lines = partial === '' ? state.lines : appendLogText(state.lines, partial, '\n', MAX_LINES).lines
          state = { ...state, lines, ended: reason }
          stream = null
          partial = ''
          publish()
        }
      })
      stream = own
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
