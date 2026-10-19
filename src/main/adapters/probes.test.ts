import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findMissingPath } from './file-probe'
import { probeHealth } from './health-probe'

describe('findMissingPath — spec §4 `missing`', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'dock-n-roll-files-'))
    mkdirSync(join(root, 'app'))
    writeFileSync(join(root, 'app', 'compose.yaml'), 'services: {}\n')
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('finds nothing when the working dir and every config file exist', async () => {
    await expect(findMissingPath(join(root, 'app'), [join(root, 'app', 'compose.yaml')])).resolves.toBeNull()
  })

  it('finds nothing for a never-started pin with no config file yet', async () => {
    await expect(findMissingPath(join(root, 'app'), [])).resolves.toBeNull()
  })

  it('names the working dir when it is gone, before its config files', async () => {
    const dir = join(root, 'gone')

    await expect(findMissingPath(dir, [join(dir, 'compose.yaml')])).resolves.toEqual({ kind: 'folder', path: dir })
  })

  it('names the config file that is gone', async () => {
    const file = join(root, 'app', 'compose.override.yaml')

    await expect(findMissingPath(join(root, 'app'), [join(root, 'app', 'compose.yaml'), file])).resolves.toEqual({ kind: 'compose file', path: file })
  })

  it('names the working dir when it is a file', async () => {
    const dir = join(root, 'app', 'compose.yaml')

    await expect(findMissingPath(dir, [])).resolves.toEqual({ kind: 'folder', path: dir })
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
