import type { ServiceStatus } from '../domain/types'
import type { ControllerState, ServiceView } from '../../shared/ipc'

/** Subset of Electron's `MenuItemConstructorOptions`, kept Electron-free so it is unit-tested. */
export interface MenuEntry {
  readonly label?: string
  readonly type?: 'separator'
  readonly enabled?: boolean
  readonly click?: () => void
  readonly submenu?: readonly MenuEntry[]
}

export interface TrayActions {
  start(id: string): void
  stop(id: string): void
  openUrl(id: string): void
  openDashboard(): void
  quit(): void
}

/** Status colours of spec §4, as text (tray menus cannot be styled). */
const BADGE: Readonly<Record<ServiceStatus, string>> = {
  on: '🟢',
  off: '🔴',
  starting: '🟠',
  stopping: '🟠',
  partial: '🟠',
  missing: '⚪',
  conflict: '⚪',
  invalid: '⚪'
}

function serviceEntry(service: ServiceView, actions: TrayActions): MenuEntry {
  const submenu: MenuEntry[] = [
    { label: 'Start', enabled: service.controls.start, click: () => { actions.start(service.id) } },
    { label: 'Stop', enabled: service.controls.stop, click: () => { actions.stop(service.id) } }
  ]
  if (service.hasUrl) submenu.push({ label: 'Open in browser', enabled: true, click: () => { actions.openUrl(service.id) } })
  if (service.reason !== null) submenu.push({ label: service.reason, enabled: false })
  return { label: `${BADGE[service.status]} ${service.displayName}`, submenu }
}

/**
 * The tray menu for a state. On Linux the tray click is not guaranteed (spec R5, ADR-0001), so
 * every action is reachable from here; the main process re-checks each control anyway.
 */
export function buildTrayMenu(state: ControllerState, actions: TrayActions): MenuEntry[] {
  let head: MenuEntry[]
  if (!state.dockerAvailable) {
    head = [{ label: `Docker unavailable${state.dockerReason === null ? '' : `: ${state.dockerReason}`}`, enabled: false }]
  } else if (state.services.length === 0) {
    head = [{ label: 'No Compose project found', enabled: false }]
  } else {
    head = state.services.map((service) => serviceEntry(service, actions))
  }
  return [
    ...head,
    { type: 'separator' },
    { label: 'Open dashboard', click: () => { actions.openDashboard() } },
    { label: 'Quit', click: () => { actions.quit() } }
  ]
}
