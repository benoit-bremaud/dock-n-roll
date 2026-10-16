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

  const follow = (id: string): void => {
    stream = followLogs(daemon.socketPath, id, {
      onText: (chunk) => {
        text += chunk
      },
      onEnd: (reason) => ends.push(reason)
    })
  }

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

  it('decodes multiplexed frames, also when a frame and a character are split across chunks', async () => {
    follow('web')
    await waitFor(() => daemon.openLogStreams === 1)
    const bytes = new Uint8Array([...frame(1, 'café\n'), ...frame(2, 'oops\n')])

    daemon.writeLogs(bytes.slice(0, 3))
    daemon.writeLogs(bytes.slice(3, 12))
    daemon.writeLogs(bytes.slice(12))

    await waitFor(() => text === 'café\noops\n')
  })

  it('passes a TTY container raw stream through', async () => {
    daemon.ttyLogs.add('web')
    follow('web')
    await waitFor(() => daemon.openLogStreams === 1)

    daemon.writeLogs(encoder.encode('raw line\n'))

    await waitFor(() => text === 'raw line\n')
  })

  it('reports the end of the stream once, when the container stops', async () => {
    follow('web')
    await waitFor(() => daemon.openLogStreams === 1)

    daemon.endLogs()

    await waitFor(() => ends.length > 0)
    expect(ends).toEqual(['Log stream ended'])
  })

  it('reports a refused stream with its HTTP status', async () => {
    follow('gone')

    await waitFor(() => ends.length > 0)
    expect(ends).toEqual(['Docker refused the logs (HTTP 404)'])
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

    expect(text).toBe('')
    expect(ends).toEqual([])
  })
})
