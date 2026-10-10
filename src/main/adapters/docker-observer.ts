import { request, type ClientRequest } from 'node:http'
import type { ContainerSnapshot } from '../domain/types'
import { containerIds, parseDockerEvent, toContainerSnapshot, type DockerEvent } from './docker-mapping'

// Docker Engine API over its Unix socket, without SDK (ADR-0005). Follows sequence diagram 06.

const API_PREFIX = '/v1.47'
const REQUEST_TIMEOUT_MS = 5000
const EVENTS_PATH = `/events?filters=${encodeURIComponent(JSON.stringify({ type: ['container'] }))}`

export interface DockerObserverOptions {
  readonly socketPath: string
  readonly initialDelayMs?: number
  readonly maxDelayMs?: number
}

export interface DockerListener {
  /** The whole snapshot, after the first sync and after every change. */
  onSnapshot(containers: ContainerSnapshot[]): void
  /** The daemon cannot be reached or the stream dropped; a resync follows automatically. */
  onUnavailable(reason: string): void
}

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
      response.on('end', () => {
        try {
          resolve({ status: response.statusCode ?? 0, body: JSON.parse(raw) as unknown })
        } catch {
          reject(new Error(`invalid JSON from Docker for ${path}`))
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

/**
 * Keeps an exact snapshot of all containers with no polling. One `sync` procedure runs at
 * startup and after every stream loss: subscribe (events buffered), list and inspect, then
 * apply the buffer — so no change between the list and the subscription is lost.
 */
export function observeDocker(options: DockerObserverOptions, listener: DockerListener): DockerObserver {
  const initialDelay = options.initialDelayMs ?? 1000
  const maxDelay = options.maxDelayMs ?? 30_000
  const snapshot = new Map<string, ContainerSnapshot>()
  let delay = initialDelay
  let generation = 0
  let stopped = false
  let retry: NodeJS.Timeout | undefined
  let closeStream: (() => void) | undefined

  const publish = (): void => {
    listener.onSnapshot([...snapshot.values()])
  }

  const inspectInto = async (id: string): Promise<void> => {
    const { status, body } = await getJson(options.socketPath, `/containers/${encodeURIComponent(id)}/json`)
    const container = status === 200 ? toContainerSnapshot(body) : null
    if (container === null) {
      snapshot.delete(id)
    } else {
      snapshot.set(id, container)
    }
  }

  const apply = async (event: DockerEvent): Promise<void> => {
    if (event.kind === 'removed') {
      snapshot.delete(event.id)
    } else {
      await inspectInto(event.id)
    }
  }

  const lost = (current: number, reason: string): void => {
    // Only the live connection may trigger a retry; callbacks of an abandoned one are ignored.
    if (stopped || current !== generation) return
    generation += 1
    closeStream?.()
    listener.onUnavailable(reason)
    retry = setTimeout(() => {
      void sync()
    }, delay)
    delay = Math.min(delay * 2, maxDelay)
  }

  const sync = async (): Promise<void> => {
    const current = generation
    const buffered: DockerEvent[] = []
    let live = false
    let queue = Promise.resolve()
    const enqueue = (step: () => Promise<void>): void => {
      queue = queue.then(step).catch((error: unknown) => {
        lost(current, error instanceof Error ? error.message : String(error))
      })
    }

    const stream = openEvents(
      options.socketPath,
      (line) => {
        const event = parseDockerEvent(line)
        if (event === null || current !== generation) return
        if (live) {
          enqueue(async () => {
            await apply(event)
            if (current === generation && !stopped) publish()
          })
        } else {
          buffered.push(event)
        }
      },
      (reason) => {
        lost(current, reason)
      }
    )
    closeStream = stream.close
    try {
      await stream.ready
      const { body } = await getJson(options.socketPath, '/containers/json?all=1')
      snapshot.clear()
      for (const id of containerIds(body)) await inspectInto(id)
    } catch (error) {
      lost(current, error instanceof Error ? error.message : String(error))
      return
    }
    if (current !== generation || stopped) return
    live = true
    for (const event of buffered.splice(0)) {
      enqueue(() => apply(event))
    }
    enqueue(() => {
      if (current === generation && !stopped) {
        delay = initialDelay
        publish()
      }
      return Promise.resolve()
    })
  }

  void sync()
  return {
    stop: () => {
      stopped = true
      generation += 1
      clearTimeout(retry)
      closeStream?.()
    }
  }
}
