import type { ServiceView } from '../../shared/ipc'

type ServiceStatus = ServiceView['status']

/** `/home/u/x` → `~/x`. Only a whole home folder is replaced, never a prefix of another name. */
export function shortenPath(path: string, homeDir: string): string {
  const home = homeDir.replace(/\/+$/, '')
  if (home === '') return path
  if (path === home) return '~'
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}

/** Share of the kept characters taken from the start; the end, which holds a file name, gets the rest. */
const HEAD_SHARE = 0.4

/** Cuts the middle of a text longer than `max` characters (at least the `…` is kept). */
export function middleEllipsis(text: string, max: number): string {
  // Code points, not UTF-16 units: a cut never splits an emoji or other astral character.
  const chars = Array.from(text)
  if (chars.length <= max) return text
  const kept = Math.max(0, max - 1)
  const head = Math.floor(kept * HEAD_SHARE)
  const tail = kept - head
  return `${chars.slice(0, head).join('')}…${tail === 0 ? '' : chars.slice(-tail).join('')}`
}

/** Longest path shown in a reason; the full reason stays in the tooltip. */
const REASON_PATH_MAX = 40

/**
 * A path in a reason: quoted (the main process quotes them, spaces included), or bare — a `/` that
 * does not follow a word, `:` or `/` (so not "and/or" nor a URL), up to a space, a quote or a
 * closing bracket, a final punctuation mark left outside.
 */
const REASON_PATH = /"(\/[^"]*)"|(?<![\w:/.~-])(\/[^\s"'`),;\]]*[^\s"'`),;:.!?\]])/g

/** #44: every path in a reason gets ~ for the home folder and a cut middle when long. */
export function shortenReason(reason: string, homeDir: string): string {
  const shorten = (path: string): string => middleEllipsis(shortenPath(path, homeDir), REASON_PATH_MAX)
  return reason.replaceAll(REASON_PATH, (_match, quoted: string | undefined, bare: string) => (quoted === undefined ? shorten(bare) : `"${shorten(quoted)}"`))
}

/** Header line, e.g. "2 of 4 on"; `null` when there is nothing to count. */
export function runningSummary(statuses: readonly ServiceStatus[]): string | null {
  if (statuses.length === 0) return null
  const on = statuses.filter((status) => status === 'on').length
  return `${String(on)} of ${String(statuses.length)} on`
}

/** How close to the bottom (px) still counts as following the logs: new lines then scroll into view. */
const FOLLOW_SLACK_PX = 24

/** UC7: the developer has not scrolled up to read, so new lines keep the view at the bottom. */
export function isFollowing({ scrollHeight, scrollTop, clientHeight }: { readonly scrollHeight: number; readonly scrollTop: number; readonly clientHeight: number }): boolean {
  return scrollHeight - scrollTop - clientHeight < FOLLOW_SLACK_PX
}
