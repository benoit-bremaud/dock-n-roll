import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PinFileResult } from '../domain/types'
import { openPinFileStore } from './pin-file-store'

// The filesystem boundary, simulated: hung calls (stale network mount) and watcher lifecycle.
const fsState = vi.hoisted(() => ({
  hangMkdir: false,
  hangRead: false,
  failMkdir: false,
  text: 'services: []\n',
  ino: 1,
  open: 0,
  listeners: [] as ((event: string, filename: string | null) => void)[]
}))

const hang = (): Promise<never> => new Promise<never>(() => undefined)

vi.mock('node:fs/promises', () => ({
  mkdir: () => (fsState.hangMkdir ? hang() : fsState.failMkdir ? Promise.reject(new Error('EACCES')) : Promise.resolve(undefined)),
  stat: () => Promise.resolve({ ino: fsState.ino, size: 0, isFile: () => true }),
  readFile: () => (fsState.hangRead ? hang() : Promise.resolve(fsState.text))
}))

vi.mock('node:fs', () => ({
  watch: (_dir: string, listener: (event: string, filename: string | null) => void) => {
    fsState.open += 1
    fsState.listeners.push(listener)
    let closed = false
    return {
      on: () => undefined,
      close: () => {
        if (!closed) fsState.open -= 1
        closed = true
      }
    }
  }
}))

const PATH = '/home/u/.config/dock-n-roll/services.yaml'
const VALID = 'services:\n  - workingDir: /srv/blog\n'

/** Fires an event on the most recent watcher, then lets the debounce and the chain run. */
async function event(filename: string): Promise<void> {
  fsState.listeners.at(-1)?.('rename', filename)
  await vi.advanceTimersByTimeAsync(100)
}

describe('openPinFileStore — hung filesystem and watcher lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.assign(fsState, { hangMkdir: false, hangRead: false, failMkdir: false, text: VALID, ino: 1, open: 0, listeners: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects after 5 s when the directory cannot be created because the mount hangs', async () => {
    fsState.hangMkdir = true
    const opening = openPinFileStore(PATH, () => undefined)
    const assertion = expect(opening).rejects.toThrow('timed out after 5000 ms')

    await vi.advanceTimersByTimeAsync(5000)

    await assertion
  })

  it('keeps the last valid pins and reports the error when a read hangs', async () => {
    const seen: PinFileResult[] = []
    const store = await openPinFileStore(PATH, (result) => seen.push(result))
    fsState.hangRead = true

    await event('services.yaml')
    await vi.advanceTimersByTimeAsync(5000)

    expect(store.current().entries).toHaveLength(1)
    expect(store.current().errors[0]).toContain('timed out after 5000 ms')
    store.close()
  })

  it('keeps exactly one live watcher across repeated re-arms', async () => {
    const store = await openPinFileStore(PATH, () => undefined)

    await event('dock-n-roll')
    fsState.ino = 2
    await event('other')

    expect(fsState.listeners).toHaveLength(3)
    expect(fsState.open).toBe(1)
    store.close()
    expect(fsState.open).toBe(0)
  })

  it('retries a failed re-arm instead of staying unwatched', async () => {
    const store = await openPinFileStore(PATH, () => undefined)
    fsState.failMkdir = true

    await event('dock-n-roll')
    expect(fsState.open).toBe(0)
    expect(store.current().errors[0]).toContain('EACCES')

    fsState.failMkdir = false
    await vi.advanceTimersByTimeAsync(5000)

    expect(fsState.open).toBe(1)
    expect(store.current().errors).toEqual([])
    store.close()
  })

  it('coalesces a burst of events into one notification', async () => {
    const seen: PinFileResult[] = []
    const store = await openPinFileStore(PATH, (result) => seen.push(result))

    for (let i = 0; i < 3; i += 1) fsState.listeners.at(-1)?.('change', 'services.yaml')
    await vi.advanceTimersByTimeAsync(99)
    expect(seen).toEqual([])
    await vi.advanceTimersByTimeAsync(1000)

    expect(seen).toHaveLength(1)
    store.close()
  })

  it('ignores events about other files of the directory', async () => {
    const seen: PinFileResult[] = []
    const store = await openPinFileStore(PATH, (result) => seen.push(result))

    await event('other.yaml')
    await vi.advanceTimersByTimeAsync(1000)

    expect(seen).toEqual([])
    store.close()
  })

  it('does not notify after close(), even with a reload already pending', async () => {
    const seen: PinFileResult[] = []
    const store = await openPinFileStore(PATH, (result) => seen.push(result))

    fsState.listeners.at(-1)?.('change', 'services.yaml')
    await vi.advanceTimersByTimeAsync(50)
    store.close()
    await vi.advanceTimersByTimeAsync(1000)

    expect(seen).toEqual([])
  })

  it('ignores events delivered after close()', async () => {
    const seen: PinFileResult[] = []
    const store = await openPinFileStore(PATH, (result) => seen.push(result))
    store.close()

    await event('services.yaml')
    await vi.advanceTimersByTimeAsync(1000)

    expect(seen).toEqual([])
  })
})
