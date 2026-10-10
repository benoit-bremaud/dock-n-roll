import { request, type ClientRequest } from 'node:http'
import type { ContainerSnapshot } from '../domain/types'
import { containerIds, parseDockerEvent, toContainerSnapshot, type DockerEvent } from './docker-mapping'

// Docker Engine API over its Unix socket, without SDK (ADR-0005). Follows sequence diagram 06.

const API_PREFIX = '/v1.47'
const REQUEST_TIMEOUT_MS = 5000
const EVENTS_PATH = `/events?filters=${encodeURIComponent(JSON.stringify({ type: ['container'] }))}`

export interface DockerObserverOptions {
  readonly socketPath: string
  /** Reconnect backoff: first wait (default 1000 ms), doubled up to `maxDelayMs` (default 30 000 ms), reset after a successful sync. */
  readonly initialDelayMs?: number
  readonly maxDelayMs?: number
  /** Schedules a retry and returns its cancel function; overridable for tests. */
  readonly schedule?: (retry: () => void, delayMs: number) => () => void
}

export interface DockerListener {
  /** The whole snapshot, after the first sync and after every change. */
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

/** Opens the event stream; `ready` settles once Docker has accepted it (status 200). */
function openEvents(
  socketPath: string,
  onLine: (line: string) => void,
  onClose: (reason: string) => void
): { ready: Promise<void>; close: () => void } {
  let call: ClientRequest | undefined
  const ready = new Promise<void>((resolve, reject) => {
    call = request({ socketPath, path: API_PREFIX + EVENTS_PATH }, (response) => {
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
      reject(error)
      onClose(error.message)
    })
    call.end()
  })
  return { ready, close: () => call?.destroy() }
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
  const schedule = options.schedule ?? defaultSchedule
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
    const container = status === 200 ? toContainerSnapshot(body) : null
    if (container === null) throw new Error(`Docker answered the inspect of ${id} with HTTP ${String(status)}`)
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
    const enqueue = (step: () => Promise<void>): void => {
      queue = queue.then(step).catch((error: unknown) => {
        lost(attempt, error instanceof Error ? error.message : String(error))
      })
    }
    const apply = async (event: DockerEvent): Promise<void> => {
      if (!isCurrent(attempt)) return
      if (event.kind === 'removed') {
        snapshot.delete(event.id)
      } else {
        await inspectInto(event.id, snapshot, attempt)
      }
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
      (line) => {
        const event = parseDockerEvent(line)
        if (event === null || !isCurrent(attempt)) return
        if (live) {
          enqueue(async () => {
            await apply(event)
            publish()
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
        await inspectInto(id, fresh, attempt)
      }
    } catch (error) {
      lost(attempt, error instanceof Error ? error.message : String(error))
      return
    }
    if (!isCurrent(attempt)) return
    snapshot = fresh
    live = true
    for (const event of buffered.splice(0)) {
      enqueue(() => apply(event))
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
