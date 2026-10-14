import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { filesExist } from './file-probe'
import { probeHealth } from './health-probe'

describe('filesExist — spec §4 `missing`', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'dock-n-roll-files-'))
    mkdirSync(join(root, 'app'))
    writeFileSync(join(root, 'app', 'compose.yaml'), 'services: {}\n')
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('is true when the working dir and every config file exist', async () => {
    await expect(filesExist(join(root, 'app'), [join(root, 'app', 'compose.yaml')])).resolves.toBe(true)
  })

  it('is true for a never-started pin with no config file yet', async () => {
    await expect(filesExist(join(root, 'app'), [])).resolves.toBe(true)
  })

  it('is false when the working dir is gone', async () => {
    await expect(filesExist(join(root, 'gone'), [])).resolves.toBe(false)
  })

  it('is false when a config file is gone', async () => {
    await expect(filesExist(join(root, 'app'), [join(root, 'app', 'compose.override.yaml')])).resolves.toBe(false)
  })

  it('is false when the working dir is a file', async () => {
    await expect(filesExist(join(root, 'app', 'compose.yaml'), [])).resolves.toBe(false)
  })
})

describe('probeHealth — spec §3 healthUrl gate', () => {
  let server: Server
  let base: string

  beforeAll(async () => {
    server = createServer((request, response) => {
      const routes: Record<string, () => void> = {
        '/ok': () => response.writeHead(200).end('UP'),
        '/redirect': () => response.writeHead(302, { location: '/elsewhere' }).end(),
        '/down': () => response.writeHead(503).end(),
        '/slow': () => setTimeout(() => response.writeHead(200).end(), 2000)
      }
      const route = routes[request.url ?? '']
      if (route === undefined) {
        response.writeHead(404).end()
      } else {
        route()
      }
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve)
    })
    base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  })

  afterAll(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve()
      })
    })
  })

  it.each([
    ['/ok', true],
    ['/redirect', true],
    ['/down', false],
    ['/missing', false]
  ])('answers %s → %s (2xx and 3xx pass, without following redirects)', async (path, expected) => {
    await expect(probeHealth(base + path, { timeoutMs: 1000 })).resolves.toBe(expected)
  })

  it('is false on timeout', async () => {
    await expect(probeHealth(`${base}/slow`, { timeoutMs: 100 })).resolves.toBe(false)
  })

  it('is false when nothing listens', async () => {
    await expect(probeHealth('http://127.0.0.1:1/', { timeoutMs: 500 })).resolves.toBe(false)
  })
})
