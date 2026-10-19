import { afterEach, describe, expect, it, vi } from 'vitest'
import { findMissingPath } from './file-probe'

// A stat on a stale network mount never answers: simulated at the filesystem boundary.
vi.mock('node:fs/promises', () => ({ stat: () => new Promise<never>(() => undefined) }))

describe('findMissingPath — hung filesystem', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports the working dir as missing after 2 s instead of holding every recomputation', async () => {
    vi.useFakeTimers()
    let settled = false
    const result = findMissingPath('/mnt/nfs/app', ['/mnt/nfs/app/compose.yaml']).finally(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(1999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    await expect(result).resolves.toEqual({ kind: 'folder', path: '/mnt/nfs/app' })
  })
})
