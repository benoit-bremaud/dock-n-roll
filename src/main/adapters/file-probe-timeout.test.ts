import { afterEach, describe, expect, it, vi } from 'vitest'
import { filesExist } from './file-probe'

// A stat on a stale network mount never answers: simulated at the filesystem boundary.
vi.mock('node:fs/promises', () => ({ stat: () => new Promise<never>(() => undefined) }))

describe('filesExist — hung filesystem', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('answers false after 2 s instead of holding every recomputation', async () => {
    vi.useFakeTimers()
    const result = filesExist('/mnt/nfs/app', ['/mnt/nfs/app/compose.yaml'])

    await vi.advanceTimersByTimeAsync(2000)

    await expect(result).resolves.toBe(false)
  })
})
