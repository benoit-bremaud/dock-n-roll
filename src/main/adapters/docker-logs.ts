import { request } from 'node:http'
import { parseLogFrames } from '../domain/log-lines'
import { API_PREFIX } from './docker-observer'

// Follows one container's logs over the Docker socket (ADR-0008, diagram 14).

const TAIL_LINES = 500
const HEADERS_TIMEOUT_MS = 5000

export interface LogListener {
  /** Decoded text, stdout and stderr interleaved; lines may be split across calls. */
  onText(text: string): void
  /** Once, when the stream ends or fails; never after `stop()`. */
  onEnd(reason: string): void
}

export interface LogStream {
  /** Final: the request is destroyed and no callback fires afterwards. */
  stop(): void
}

export function followLogs(socketPath: string, containerId: string, listener: LogListener, headersTimeoutMs = HEADERS_TIMEOUT_MS): LogStream {
  let stopped = false
  const end = (reason: string): void => {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    listener.onEnd(reason)
  }
  const path = `${API_PREFIX}/containers/${encodeURIComponent(containerId)}/logs?follow=1&stdout=1&stderr=1&tail=${String(TAIL_LINES)}`
  const call = request({ socketPath, path }, (response) => {
    clearTimeout(timer)
    if (response.statusCode !== 200) {
      response.resume()
      end(`Docker refused the logs (HTTP ${String(response.statusCode)})`)
      return
    }
    // Docker names the framing in the content type (API >= 1.42): raw text for a TTY container.
    const multiplexed = response.headers['content-type'] !== 'application/vnd.docker.raw-stream'
    // One decoder for the whole stream: a character may be split across chunks.
    const decoder = new TextDecoder()
    let rest: Uint8Array = new Uint8Array()
    response.on('data', (chunk: Buffer) => {
      if (stopped) return
      if (!multiplexed) {
        listener.onText(decoder.decode(chunk, { stream: true }))
        return
      }
      const parsed = parseLogFrames(Buffer.concat([rest, chunk]))
      rest = parsed.rest
      for (const payload of parsed.payloads) listener.onText(decoder.decode(payload, { stream: true }))
    })
    response.on('close', () => {
      end('Log stream ended')
    })
  })
  // Bounds only the wait for the headers: a quiet container keeps its stream open.
  const timer = setTimeout(() => call.destroy(new Error('Docker did not answer the logs in time')), headersTimeoutMs)
  call.on('error', (error) => {
    end(error.message)
  })
  call.end()
  return {
    stop: () => {
      stopped = true
      clearTimeout(timer)
      call.destroy()
    }
  }
}
