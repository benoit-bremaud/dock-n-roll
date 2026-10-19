import { request } from 'node:http'
import { MAX_LOG_LINES } from '../domain/log-lines'
import { parseLogFrames, type LogFrame } from './docker-frames'
import { API_PREFIX } from './docker-observer'

// Follows one container's logs over the Docker socket (ADR-0008, diagram 14).

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

/**
 * Follows one container's logs: the last `MAX_LOG_LINES`, then live. Never throws: every
 * failure (non-200, socket error, invalid frame, no headers within `headersTimeoutMs`) reaches
 * `listener.onEnd` exactly once. The timeout bounds the wait for headers only: a quiet
 * container keeps its stream open.
 */
export function followLogs(socketPath: string, containerId: string, listener: LogListener, headersTimeoutMs = HEADERS_TIMEOUT_MS): LogStream {
  let stopped = false
  const end = (reason: string): void => {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    listener.onEnd(reason)
  }
  const path = `${API_PREFIX}/containers/${encodeURIComponent(containerId)}/logs?follow=1&stdout=1&stderr=1&tail=${String(MAX_LOG_LINES)}`
  const call = request({ socketPath, path }, (response) => {
    clearTimeout(timer)
    if (response.statusCode !== 200) {
      response.resume()
      end(`Docker refused the logs (HTTP ${String(response.statusCode)})`)
      return
    }
    // Docker names the framing in the content type (API >= 1.42): raw text for a TTY container.
    const multiplexed = response.headers['content-type'] !== 'application/vnd.docker.raw-stream'
    // One decoder per stream: a character split across frames of stdout is not broken by a
    // stderr frame between them. A TTY stream uses the stdout one.
    const stdout = new TextDecoder()
    const stderr = new TextDecoder()
    // Stream byte 2 is stderr; 1 (and 0, never sent for logs) is stdout.
    const decode = (stream: number, bytes: Uint8Array): string => (stream === 2 ? stderr : stdout).decode(bytes, { stream: true })
    const emit = (frames: readonly LogFrame[]): void => {
      for (const { stream, bytes } of frames) listener.onText(decode(stream, bytes))
    }
    let rest: Uint8Array = new Uint8Array()
    response.on('data', (chunk: Buffer) => {
      if (stopped) return
      if (!multiplexed) {
        listener.onText(decode(1, chunk))
        return
      }
      const parsed = parseLogFrames(Buffer.concat([rest, chunk]))
      rest = parsed.rest
      if (parsed.invalid) {
        // Frames before the bad header still count; nothing after it is trusted.
        emit(parsed.frames)
        end('Unreadable log stream')
        call.destroy()
        return
      }
      emit(parsed.frames)
    })
    response.on('error', (error) => {
      end(error.message)
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
