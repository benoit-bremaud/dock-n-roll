import { Notification } from 'electron'

/** The notification server reads a subset of markup in the body (not the title). */
export function escapeMarkup(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Desktop notification (diagram 13); silently skipped where the desktop has no notification server. */
export function showNotification(title: string, body: string): void {
  if (!Notification.isSupported()) return
  new Notification({ title, body: escapeMarkup(body) }).show()
}
