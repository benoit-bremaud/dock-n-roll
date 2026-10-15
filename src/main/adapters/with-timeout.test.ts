import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withTimeout } from './with-timeout'

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves with the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'stat')).resolves.toBe(42)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('passes a rejection through unchanged', async () => {
    await expect(withTimeout(Promise.reject(new Error('EACCES')), 1000, 'stat')).rejects.toThrow('EACCES')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects with a named timeout when the promise hangs (stale network mount)', async () => {
    const result = withTimeout(new Promise<never>(() => undefined), 1000, 'stat /mnt/nfs')
    const assertion = expect(result).rejects.toThrow('stat /mnt/nfs timed out after 1000 ms')

    await vi.advanceTimersByTimeAsync(1000)

    await assertion
  })
})
