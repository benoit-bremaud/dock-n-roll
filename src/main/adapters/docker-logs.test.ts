import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { followLogs, type LogStream } from './docker-logs'
import { FakeDockerDaemon } from './fake-docker-daemon'

const encoder = new TextEncoder()

function frame(stream: 1 | 2, text: string): Uint8Array {
  const payload = encoder.encode(text)
  const header = new Uint8Array(8)
  header[0] = stream
  new DataView(header.buffer).setUint32(4, payload.length)
  return new Uint8Array([...header, ...payload])
}

async function waitFor(check: () => boolean): Promise<void> {
  await vi.waitFor(() => {
    expect(check()).toBe(true)
  }, { timeout: 3000, interval: 10 })
}

describe('followLogs — diagram 14, ADR-0008', () => {
  let dir: string
  let daemon: FakeDockerDaemon
  let stream: LogStream | undefined
  let text: string
  let ends: string[]

  const follow = (id: string, headersTimeoutMs?: number, sinceMs?: number): void => {
    stream = followLogs(daemon.socketPath, id, {
      onText: (chunk) => {
        text += chunk
      },
      onEnd: (reason) => ends.push(reason)
    }, { headersTimeoutMs, sinceMs })
  }
  /** Lets late data arrive before a negative check: can only make it pass wrongly, never flake red. */
  const quietFor = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'dock-n-roll-logs-'))
    daemon = new FakeDockerDaemon(join(dir, 'docker.sock'))
    daemon.add({ id: 'web', name: 'app-web-1', status: 'running' })
    await daemon.start()
    text = ''
    ends = []
  })

  afterEach(async () => {
    stream?.stop()
    await daemon.stop()
    rmSync(dir, { recursive: true, force: true })
  })

  it('asks for the last 500 lines of both streams, then follows', async () => {
    follow('web')
    await waitFor(() => daemon.openLogStreams === 1)

    expect(daemon.requests).toEqual(['/v1.47/containers/web/logs'])
    expect(daemon.logQueries).toEqual(['?follow=1&stdout=1&stderr=1&tail=500'])
  })

  it('asks only for the lines written since a time when resuming a container', async () => {
    follow('web', undefined, 1_760_000_000_250)
    await waitFor(() => daemon.openLogStreams === 1)

    expect(daemon.logQueries).toEqual(['?follow=1&stdout=1&stderr=1&tail=500&since=1760000000.25'])
  })

  it('decodes multiplexed frames, also when a frame and a character are split across chunks', async () => {
    follow('web')
    await waitFor(() => daemon.openLogStreams === 1)
    const bytes = new Uint8Array([...frame(1, 'café\n'), ...frame(2, 'oops\n')])
    const insideE = bytes.indexOf(0xc3) + 1

    daemon.writeLogs(bytes.slice(0, 3))
    daemon.writeLogs(bytes.slice(3, insideE))
    daemon.writeLogs(bytes.slice(insideE))

    await waitFor(() => text === 'café\noops\n')
  })

  it('decodes stdout and stderr apart, so a character split in one is not broken by the other', async () => {
    follow('web')
    await waitFor(() => daemon.openLogStreams === 1)
    const cafe = frame(1, 'café\n')
    const insideE = cafe.indexOf(0xc3) + 1
    const header = (stream: 1 | 2, size: number): Uint8Array => {
      const bytes = new Uint8Array(8)
      bytes[0] = stream
      new DataView(bytes.buffer).setUint32(4, size)
      return bytes
    }
    const payload = cafe.slice(8)
    const cut = insideE - 8

    daemon.writeLogs(new Uint8Array([...header(1, cut), ...payload.slice(0, cut), ...frame(2, 'err\n'), ...header(1, payload.length - cut), ...payload.slice(cut)]))

    // The é survives the stderr frame in between. The lines still interleave by frame, as Docker
    // sends them: the panel has one unfinished line for both streams.
    await waitFor(() => text === 'caferr\né\n')
  })

  it('passes a TTY container raw stream through', async () => {
    daemon.ttyLogs.add('web')
    follow('web')
    await waitFor(() => daemon.openLogStreams === 1)

    const bytes = encoder.encode('raw café\n')
    const insideE = bytes.indexOf(0xc3) + 1
    daemon.writeLogs(bytes.slice(0, insideE))
    await quietFor(20)
    daemon.writeLogs(bytes.slice(insideE))

    await waitFor(() => text === 'raw café\n')
  })

  it('reports the end of the stream once, when the container stops', async () => {
    follow('web')
    await waitFor(() => daemon.openLogStreams === 1)

    daemon.endLogs()

    await waitFor(() => ends.length > 0)
    expect(ends).toEqual(['Log stream ended'])
  })

  it.each([
    ['gone', undefined, 404],
    ['web', 500, 500]
  ] as const)('reports a refused stream once, with its HTTP status (%s)', async (id, status, expected) => {
    daemon.nextLogsStatus = status
    follow(id)

    await waitFor(() => ends.length > 0)
    await quietFor(30)
    expect(ends).toEqual([`Docker refused the logs (HTTP ${String(expected)})`])
  })

  it('gives up when Docker sends no headers in time, but keeps a quiet open stream', async () => {
    daemon.hangNextLogs = true
    follow('web', 50)
    await waitFor(() => ends.length > 0)
    expect(ends).toEqual(['Docker did not answer the logs in time'])

    stream?.stop()
    ends = []
    follow('web', 50)
    await waitFor(() => daemon.openLogStreams === 1)
    await quietFor(100)
    expect(ends).toEqual([])
  })

  it('drops a stream whose frame header is not Docker\'s, after the valid frames', async () => {
    follow('web')
    await waitFor(() => daemon.openLogStreams === 1)

    daemon.writeLogs(new Uint8Array([...frame(1, 'ok\n'), 9, 9, 9, 9, 0, 0, 0, 1]))

    await waitFor(() => ends.length > 0)
    expect(text).toBe('ok\n')
    expect(ends).toEqual(['Unreadable log stream'])
  })

  it('reports an unreachable daemon', async () => {
    await daemon.stop()
    follow('web')

    await waitFor(() => ends.length > 0)
    expect(ends[0]).toMatch(/ENOENT|ECONNREFUSED/)
  })

  it('closes the request on stop and reports nothing afterwards', async () => {
    follow('web')
    await waitFor(() => daemon.openLogStreams === 1)

    stream?.stop()
    await waitFor(() => daemon.openLogStreams === 0)
    daemon.writeLogs(frame(1, 'late\n'))
    await quietFor(30)

    expect(text).toBe('')
    expect(ends).toEqual([])
  })

  it('reports nothing when stopped before the headers', async () => {
    daemon.hangNextLogs = true
    follow('web', 50)
    stream?.stop()

    await quietFor(100)
    expect(ends).toEqual([])
  })
})
