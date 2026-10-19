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
  if (text.length <= max) return text
  const kept = Math.max(0, max - 1)
  const head = Math.floor(kept * HEAD_SHARE)
  const tail = kept - head
  return `${text.slice(0, head)}…${tail === 0 ? '' : text.slice(-tail)}`
}

/** Longest path shown in a reason; the full reason stays in the tooltip. */
const REASON_PATH_MAX = 40

/**
 * A path in a reason: a `/` that does not follow a word, `:` or `/` (so not "and/or" nor a URL),
 * up to a space, a quote or a closing bracket; a final punctuation mark is left outside.
 */
const REASON_PATH = /(?<![\w:/.~-])\/[^\s"'`),;\]]*[^\s"'`),;:.!?\]]/g

/** #44: every path in a reason gets ~ for the home folder and a cut middle when long. */
export function shortenReason(reason: string, homeDir: string): string {
  return reason.replaceAll(REASON_PATH, (path) => middleEllipsis(shortenPath(path, homeDir), REASON_PATH_MAX))
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
