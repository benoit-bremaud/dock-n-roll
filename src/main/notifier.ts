import { Notification } from 'electron'

/** The Linux notification server reads a subset of markup in the body (not the title); the app ships for Linux only. */
export function escapeMarkup(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** Desktop notification (diagram 13); silently skipped where the desktop has no notification server. */
export function showNotification(title: string, body: string): void {
  if (!Notification.isSupported()) return
  new Notification({ title, body: escapeMarkup(body) }).show()
}
