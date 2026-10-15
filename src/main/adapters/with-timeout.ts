/**
 * Rejects when `promise` has not settled after `ms` — a filesystem call on a stale network
 * mount can hang forever and would hold every caller waiting on it. The underlying call is not
 * cancelled (Node cannot abort a pending `stat`): its libuv thread stays busy, but the caller
 * moves on.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${String(ms)} ms`))
    }, ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}
