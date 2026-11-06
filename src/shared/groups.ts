// How the tray and the dashboard lay out the list by group (#98, groups class diagram 03).
import type { ServiceView } from './ipc'

/** Members of a group, in list order; a service of several groups is a member of each. */
export function membersOf(services: readonly ServiceView[], name: string): ServiceView[] {
  return services.filter((service) => service.groups.includes(name))
}

/** Services of no group, listed after the groups. */
export function ungrouped(services: readonly ServiceView[]): ServiceView[] {
  return services.filter((service) => service.groups.length === 0)
}

/** `1 of 3 on`: the group's status at a glance. */
export function groupSummary(members: readonly ServiceView[]): string {
  return `${String(members.filter((member) => member.status === 'on').length)} of ${String(members.length)} on`
}
