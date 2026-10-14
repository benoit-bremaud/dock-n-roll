import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PinFileResult } from '../domain/types'
import { openPinFileStore, parsePinFileText, type PinFileStore } from './pin-file-store'

const VALID = 'services:\n  - workingDir: /srv/app\n    name: App\n'
const VALID_ENTRY = { workingDir: '/srv/app', name: 'App', pinned: false, hidden: false }

async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met in time')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe('parsePinFileText', () => {
  it('parses YAML and validates it', () => {
    expect(parsePinFileText(VALID)).toEqual({ entries: [VALID_ENTRY], errors: [] })
  })

  it('reports a YAML syntax error with its line instead of throwing', () => {
    const result = parsePinFileText('services:\n  - workingDir: /srv/app\n   name: bad indent\n')

    expect(result.entries).toEqual([])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/line \d+/)
  })

  it('refuses an alias bomb instead of expanding it', () => {
    // "Billion laughs": each level repeats the previous one 10 times (10^8 nodes if expanded).
    const levels = 'abcdefgh'.split('')
    const bomb = [
      'a: &a [x, x, x, x, x, x, x, x, x, x]',
      ...levels.slice(1).map((name, i) => `${name}: &${name} [${Array<string>(10).fill(`*${levels[i] ?? 'a'}`).join(', ')}]`),
      'services: *h'
    ].join('\n')

    const result = parsePinFileText(bomb)

    expect(result.entries).toEqual([])
    expect(result.errors).toHaveLength(1)
  })
})

describe('openPinFileStore — spec §9 Q1 (watched file)', () => {
  let dir: string
  let path: string
  let store: PinFileStore | undefined
  let seen: PinFileResult[]

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dock-n-roll-pins-'))
    path = join(dir, 'config', 'services.yaml')
    seen = []
  })

  afterEach(() => {
    store?.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('starts with no pins and no error when the file does not exist, creating its directory', async () => {
    store = await openPinFileStore(path, (result) => seen.push(result))

    expect(store.current()).toEqual({ entries: [], errors: [] })
    expect(existsSync(dirname(path))).toBe(true)
  })

  it('loads an existing file at open, without waiting for a change', async () => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, VALID)

    store = await openPinFileStore(path, (result) => seen.push(result))

    expect(store.current()).toEqual({ entries: [VALID_ENTRY], errors: [] })
    expect(seen).toEqual([])
  })

  it('coalesces a burst of writes into one notification', async () => {
    store = await openPinFileStore(path, (result) => seen.push(result))
    writeFileSync(path, VALID)
    writeFileSync(path, VALID)
    writeFileSync(path, VALID)

    await waitFor(() => seen.length > 0)
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(seen).toHaveLength(1)
  })

  it('does not notify after close(), even with a reload already pending', async () => {
    store = await openPinFileStore(path, (result) => seen.push(result))
    writeFileSync(path, VALID)
    await new Promise((resolve) => setTimeout(resolve, 20))
    store.close()

    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(seen).toEqual([])
  })

  it('ignores other files of the directory', async () => {
    store = await openPinFileStore(path, (result) => seen.push(result))
    writeFileSync(join(dirname(path), 'other.yaml'), VALID)

    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(seen).toEqual([])
  })

  it('keeps watching when the listener throws', async () => {
    let calls = 0
    store = await openPinFileStore(path, () => {
      calls += 1
      throw new Error('bug in the controller')
    })
    writeFileSync(path, VALID)
    await waitFor(() => calls === 1)
    writeFileSync(path, 'services: []\n')

    await waitFor(() => calls === 2)
    expect(store.current()).toEqual({ entries: [], errors: [] })
  })

  it('re-arms the watch when its directory is removed and recreated', async () => {
    store = await openPinFileStore(path, (result) => seen.push(result))
    rmSync(dirname(path), { recursive: true, force: true })
    await waitFor(() => existsSync(dirname(path)))

    writeFileSync(path, VALID)

    await waitFor(() => store?.current().entries.length === 1)
  })

  it('loads the file and reports changes after an editor-style atomic save', async () => {
    store = await openPinFileStore(path, (result) => seen.push(result))
    writeFileSync(`${path}.tmp`, VALID)
    renameSync(`${path}.tmp`, path)

    await waitFor(() => seen.length > 0)
    expect(store.current()).toEqual({ entries: [VALID_ENTRY], errors: [] })
  })

  it('keeps the last valid pins when the file becomes invalid YAML, and reports the error', async () => {
    store = await openPinFileStore(path, (result) => seen.push(result))
    writeFileSync(path, VALID)
    await waitFor(() => store?.current().entries.length === 1)

    writeFileSync(path, 'services: [unclosed\n')

    await waitFor(() => store?.current().errors.length === 1)
    expect(store.current().entries).toEqual([VALID_ENTRY])
  })

  it('drops every pin when the file is deleted', async () => {
    store = await openPinFileStore(path, (result) => seen.push(result))
    writeFileSync(path, VALID)
    await waitFor(() => store?.current().entries.length === 1)

    unlinkSync(path)

    await waitFor(() => store?.current().entries.length === 0)
    expect(store.current().errors).toEqual([])
  })

  it('stops notifying once closed', async () => {
    store = await openPinFileStore(path, (result) => seen.push(result))
    store.close()
    writeFileSync(path, VALID)

    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(seen).toEqual([])
  })
})
