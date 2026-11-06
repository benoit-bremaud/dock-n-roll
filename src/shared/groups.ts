// Pure list helpers shared by the tray and the dashboard: layout by group (#98, groups class
// diagram 03) and the `n of m on` summary.
import type { ServiceView } from './ipc'

/** Members of a group, in list order; a service of several groups is a member of each. */
export function membersOf(services: readonly ServiceView[], name: string): ServiceView[] {
  return services.filter((service) => service.groups.includes(name))
}

/** Services of no group, listed after the groups. */
export function ungrouped(services: readonly ServiceView[]): ServiceView[] {
  return services.filter((service) => service.groups.length === 0)
}

/** Header line, e.g. "2 of 4 on"; `null` when there is nothing to count. */
export function runningSummary(statuses: readonly ServiceView['status'][]): string | null {
  if (statuses.length === 0) return null
  const on = statuses.filter((status) => status === 'on').length
  return `${String(on)} of ${String(statuses.length)} on`
}

/** `1 of 3 on`: the group's status at a glance, the same rule as the header line. */
export function groupSummary(members: readonly ServiceView[]): string {
  return runningSummary(members.map((member) => member.status)) ?? '0 of 0 on'
}
