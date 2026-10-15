// The part of an IPC event the trust check reads; structural so tests need no Electron.
interface SenderFrame {
  readonly parent: unknown
  readonly url: string
}

export interface SenderEvent {
  readonly sender: unknown
  readonly senderFrame: SenderFrame | null
}

/** Where the dashboard page is served from: the bundled file, or the dev server in development. */
export type DashboardOrigin = { readonly kind: 'file'; readonly url: string } | { readonly kind: 'devServer'; readonly url: string }

/**
 * IPC calls are accepted only from the dashboard page itself: the top frame of the dashboard
 * window's own `webContents`, on the bundled page (exact URL) or the dev server (URL prefix).
 */
export function isTrustedSender(event: SenderEvent, dashboard: unknown, origin: DashboardOrigin): boolean {
  const frame = event.senderFrame
  if (frame === null || frame.parent !== null || dashboard === null || event.sender !== dashboard) return false
  return origin.kind === 'devServer' ? frame.url.startsWith(origin.url) : frame.url === origin.url
}
