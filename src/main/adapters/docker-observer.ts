import { request, type ClientRequest } from 'node:http'
import type { ContainerSnapshot } from '../domain/types'
import { containerIds, parseDockerEvent, toContainerSnapshot, type DockerEvent } from './docker-mapping'

// Docker Engine API over its Unix socket, without SDK (ADR-0005). Follows sequence diagram 06.

export const API_PREFIX = '/v1.47'
const REQUEST_TIMEOUT_MS = 5000
const EVENTS_HEADERS_TIMEOUT_MS = 5000
const EVENTS_PATH = `/events?filters=${encodeURIComponent(JSON.stringify({ type: ['container'] }))}`

export interface DockerObserverOptions {
  readonly socketPath: string
  /** Reconnect backoff: first wait (default 1000 ms), doubled up to `maxDelayMs` (default 30 000 ms), reset after a successful sync. */
  readonly initialDelayMs?: number
  readonly maxDelayMs?: number
  /** Wait for the event stream's headers before treating the daemon as hung (default 5000 ms). */
  readonly headersTimeoutMs?: number
  /** Schedules a retry and returns its cancel function; overridable for tests. */
  readonly schedule?: (retry: () => void, delayMs: number) => () => void
  /** A burst publishes once when drained, and at least every `maxBatch` events while it lasts (default 50). */
  readonly maxBatch?: number
}

export interface DockerListener {
  /** The whole snapshot, after the first sync and after every change (once per burst of events). */
  onSnapshot(containers: ContainerSnapshot[]): void
  /** The daemon cannot be reached or the stream dropped; a resync follows automatically. */
  onUnavailable(reason: string): void
}

/** Handle on a running observation; `stop()` is final: no callback fires afterwards. */
export interface DockerObserver {
  stop(): void
}

function getJson(socketPath: string, path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const call = request({ socketPath, path: API_PREFIX + path, timeout: REQUEST_TIMEOUT_MS }, (response) => {
      let raw = ''
      response.setEncoding('utf8')
      response.on('data', (chunk: string) => {
        raw += chunk
      })
      response.on('error', reject)
      // A connection cut mid-body emits `close` without `end`: reject instead of waiting forever.
      response.on('close', () => {
        if (!response.complete) reject(new Error(`Docker closed ${path} mid-response`))
      })
      response.on('end', () => {
        const status = response.statusCode ?? 0
        try {
          resolve({ status, body: JSON.parse(raw) as unknown })
        } catch {
          reject(new Error(`Docker answered ${path} with HTTP ${String(status)} and no JSON`))
        }
      })
    })
    call.on('timeout', () => call.destroy(new Error(`Docker did not answer ${path} in time`)))
    call.on('error', reject)
    call.end()
  })
}

/**
 * Opens the event stream; `ready` resolves once Docker has accepted it (status 200), and rejects
 * on a refusal, a socket error, or no headers within `headersTimeoutMs`.
 */
function openEvents(
  socketPath: string,
  headersTimeoutMs: number,
  onLine: (line: string) => void,
  onClose: (reason: string) => void
): { ready: Promise<void>; close: () => void } {
  let call: ClientRequest | undefined
  let timer: NodeJS.Timeout | undefined
  const ready = new Promise<void>((resolve, reject) => {
    // Bounds only the wait for the headers: the open stream itself has no deadline.
    timer = setTimeout(() => call?.destroy(new Error('Docker did not answer the event stream in time')), headersTimeoutMs)
    call = request({ socketPath, path: API_PREFIX + EVENTS_PATH }, (response) => {
      clearTimeout(timer)
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Docker refused the event stream (HTTP ${String(response.statusCode)})`))
        return
      }
      resolve()
      // One JSON object per line; a line may be split across chunks, or several share one.
      let pending = ''
      response.setEncoding('utf8')
      response.on('data', (chunk: string) => {
        pending += chunk
        const lines = pending.split('\n')
        pending = lines.pop() ?? ''
        lines.forEach(onLine)
      })
      response.on('close', () => {
        onClose('Docker event stream closed')
      })
    })
    call.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
      onClose(error.message)
    })
    call.end()
  })
  return {
    ready,
    close: () => {
      clearTimeout(timer)
      call?.destroy()
    }
  }
}

function defaultSchedule(retry: () => void, delayMs: number): () => void {
  const timer = setTimeout(retry, delayMs)
  return () => {
    clearTimeout(timer)
  }
}

/**
 * Keeps an exact snapshot of all containers with no polling (sequence diagram 06). One `sync`
 * procedure runs at startup and after every stream loss: subscribe (events buffered), list and
 * inspect into a fresh map, then apply the buffer — so no change between the list and the
 * subscription is lost.
 *
 * Contract: never throws. The first `onSnapshot` comes after the first full sync.
 * `onUnavailable` fires once per lost connection, and again for each failed retry. Each
 * connection attempt has a generation: an abandoned one can no longer write or publish.
 * A listener that throws is logged, never mistaken for a Docker outage.
 */
export function observeDocker(options: DockerObserverOptions, listener: DockerListener): DockerObserver {
  const initialDelay = options.initialDelayMs ?? 1000
  const maxDelay = options.maxDelayMs ?? 30_000
  const maxBatch = options.maxBatch ?? 50
  const schedule = options.schedule ?? defaultSchedule
  const headersTimeout = options.headersTimeoutMs ?? EVENTS_HEADERS_TIMEOUT_MS
  let snapshot = new Map<string, ContainerSnapshot>()
  let delay = initialDelay
  let generation = 0
  let stopped = false
  let cancelRetry: (() => void) | undefined
  let closeStream: (() => void) | undefined

  const isCurrent = (attempt: number): boolean => !stopped && attempt === generation

  const notify = (call: () => void): void => {
    try {
      call()
    } catch (error) {
      console.error('dock-n-roll: Docker listener failed', error)
    }
  }

  /** Inspects one container into `into`; only 404 removes it, other errors mean a lost connection. */
  const inspectInto = async (id: string, into: Map<string, ContainerSnapshot>, attempt: number): Promise<void> => {
    const { status, body } = await getJson(options.socketPath, `/containers/${encodeURIComponent(id)}/json`)
    if (!isCurrent(attempt)) return
    if (status === 404) {
      into.delete(id)
      return
    }
    if (status !== 200) throw new Error(`Docker answered the inspect of ${id} with HTTP ${String(status)}`)
    const container = toContainerSnapshot(body)
    if (container === null) {
      // A shape this version cannot read (e.g. a state added by a newer Docker): skip that one
      // container rather than treating the whole daemon as unavailable on every retry.
      console.error(`dock-n-roll: skipping container ${id}, unreadable inspect`)
      into.delete(id)
      return
    }
    into.set(id, container)
  }

  const lost = (attempt: number, reason: string): void => {
    if (!isCurrent(attempt)) return
    generation += 1
    closeStream?.()
    notify(() => {
      listener.onUnavailable(reason)
    })
    cancelRetry = schedule(() => {
      void sync()
    }, delay)
    delay = Math.min(delay * 2, maxDelay)
  }

  const sync = async (): Promise<void> => {
    const attempt = generation
    const buffered: DockerEvent[] = []
    let live = false
    let queue = Promise.resolve()
    /** Live events queued but not applied yet, and applied since the last publish. */
    let pending = 0
    let unpublished = 0
    const enqueue = (step: () => Promise<void>): void => {
      queue = queue.then(step).catch((error: unknown) => {
        lost(attempt, error instanceof Error ? error.message : String(error))
      })
    }
    /** Applies one event; true when it took a running container out of `running`. */
    const apply = async (event: DockerEvent): Promise<boolean> => {
      if (!isCurrent(attempt)) return false
      const wasRunning = snapshot.get(event.id)?.state === 'running'
      if (event.kind === 'removed') {
        snapshot.delete(event.id)
      } else {
        await inspectInto(event.id, snapshot, attempt)
      }
      return wasRunning && snapshot.get(event.id)?.state !== 'running'
    }
    const publish = (): void => {
      if (isCurrent(attempt)) {
        const containers = [...snapshot.values()]
        notify(() => {
          listener.onSnapshot(containers)
        })
      }
    }

    const stream = openEvents(
      options.socketPath,
      headersTimeout,
      (line) => {
        const event = parseDockerEvent(line)
        if (event === null || !isCurrent(attempt)) return
        if (live) {
          pending += 1
          enqueue(async () => {
            const leftRunning = await apply(event)
            pending -= 1
            unpublished += 1
            // A `compose up` fires dozens of events: one publish (one recomputation, one IPC push)
            // per drained burst, with `maxBatch` as a floor so an endless stream still shows. A
            // container leaving `running` always publishes at once: crash notifications and health
            // gates must see it even when a restart follows in the same burst.
            if (leftRunning || pending === 0 || unpublished >= maxBatch) {
              unpublished = 0
              publish()
            }
          })
        } else {
          buffered.push(event)
        }
      },
      (reason) => {
        lost(attempt, reason)
      }
    )
    closeStream = stream.close
    const fresh = new Map<string, ContainerSnapshot>()
    try {
      await stream.ready
      const { status, body } = await getJson(options.socketPath, '/containers/json?all=1')
      if (status !== 200) throw new Error(`Docker answered the container list with HTTP ${String(status)}`)
      for (const id of containerIds(body)) {
        if (!isCurrent(attempt)) return
        // Sequential by design: stop at once when a newer sync takes over, and never flood the daemon.
        await inspectInto(id, fresh, attempt) // NOSONAR typescript:S9382
      }
    } catch (error) {
      lost(attempt, error instanceof Error ? error.message : String(error))
      return
    }
    if (!isCurrent(attempt)) return
    snapshot = fresh
    live = true
    for (const event of buffered.splice(0)) {
      enqueue(async () => {
        await apply(event)
      })
    }
    enqueue(() => {
      if (isCurrent(attempt)) delay = initialDelay
      publish()
      return Promise.resolve()
    })
  }

  void sync()
  return {
    stop: () => {
      stopped = true
      generation += 1
      cancelRetry?.()
      closeStream?.()
    }
  }
}
