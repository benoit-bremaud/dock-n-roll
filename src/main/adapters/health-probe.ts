export interface ProbeOptions {
  readonly timeoutMs: number
}

/**
 * One check of a service `healthUrl` (spec §3): `true` on HTTP 2xx or 3xx. Redirects are not
 * followed — a 3xx already proves the service answers, and following one could leave the
 * local service. Never throws: refused connections and timeouts are `false`.
 */
export async function probeHealth(url: string, options: ProbeOptions): Promise<boolean> {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(options.timeoutMs) })
    await response.body?.cancel()
    return response.status >= 200 && response.status < 400
  } catch {
    return false
  }
}
