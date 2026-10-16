// The part of an IPC event the trust check reads; structural so tests need no Electron.
interface SenderFrame {
  readonly parent: unknown
  readonly url: string
}

export interface SenderEvent {
  readonly sender: unknown
  readonly senderFrame: SenderFrame | null
}

/** Where the dashboard page is served from: the bundled page on `app://` (ADR-0009), or the dev server in development. */
export type DashboardOrigin = { readonly kind: 'app'; readonly url: string } | { readonly kind: 'devServer'; readonly url: string }

function originOf(url: string): string | null {
  return URL.canParse(url) ? new URL(url).origin : null
}

/**
 * IPC calls are accepted only from the dashboard page itself: the top frame of the dashboard
 * window's own `webContents`, on the bundled page (exact URL) or the dev server (same origin —
 * a string prefix would also accept `http://localhost:51730`).
 *
 * @param dashboardContents the dashboard window's `webContents`, or `null` when there is no live
 *   window (every call is then refused).
 */
export function isTrustedSender(event: SenderEvent, dashboardContents: object | null, origin: DashboardOrigin): boolean {
  const frame = event.senderFrame
  if (frame === null || frame.parent !== null || dashboardContents === null || event.sender !== dashboardContents) return false
  if (origin.kind === 'app') return frame.url === origin.url
  const frameOrigin = originOf(frame.url)
  return frameOrigin !== null && frameOrigin === originOf(origin.url)
}
