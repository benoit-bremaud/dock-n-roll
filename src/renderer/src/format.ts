import type { ServiceView } from '../../shared/ipc'

type ServiceStatus = ServiceView['status']

/** `/home/u/x` → `~/x`. Only a whole home folder is replaced, never a prefix of another name. */
export function shortenPath(path: string, homeDir: string): string {
  const home = homeDir.replace(/\/+$/, '')
  if (home === '') return path
  if (path === home) return '~'
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
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
