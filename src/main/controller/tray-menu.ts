import type { ServiceStatus } from '../domain/types'
import type { ControllerState, ServiceView } from '../../shared/ipc'

/** Subset of Electron's `MenuItemConstructorOptions`, kept Electron-free so it is unit-tested. */
export interface MenuEntry {
  readonly label?: string
  readonly type?: 'separator' | 'checkbox'
  readonly checked?: boolean
  readonly enabled?: boolean
  readonly click?: () => void
  readonly submenu?: readonly MenuEntry[]
}

export interface TrayActions {
  start(id: string): void
  stop(id: string): void
  restart(id: string): void
  openUrl(id: string): void
  openDashboard(): void
  quit(): void
  toggleAutostart(): void
}

export interface TrayOptions {
  /** Current "Start at login" setting; absent when autostart is not available (dev builds). */
  readonly autostart?: boolean
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

const MAX_LABEL_CHARS = 80

/**
 * Menu-safe text. Names, reasons and outage messages come from Docker labels, the pin file and
 * stderr: `&` would be read as a mnemonic, newlines could fake extra entries, long text breaks
 * the GTK menu. The dashboard shows the full text.
 */
export function menuLabel(text: string): string {
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  const flat = text.replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').replace(/ {2,}/g, ' ').trim()
  const short = flat.length > MAX_LABEL_CHARS ? `${flat.slice(0, MAX_LABEL_CHARS - 1)}…` : flat
  return short.replace(/&/g, '&&')
}

function serviceEntry(service: ServiceView, actions: TrayActions): MenuEntry {
  const submenu: MenuEntry[] = [
    { label: 'Start', enabled: service.controls.start, click: () => { actions.start(service.id) } },
    { label: 'Stop', enabled: service.controls.stop, click: () => { actions.stop(service.id) } },
    { label: 'Restart', enabled: service.controls.restart, click: () => { actions.restart(service.id) } }
  ]
  if (service.hasUrl) submenu.push({ label: 'Open in browser', enabled: true, click: () => { actions.openUrl(service.id) } })
  if (service.reason !== null) submenu.push({ label: menuLabel(service.reason), enabled: false })
  return { label: `${BADGE[service.status]} ${menuLabel(service.displayName)}`, submenu }
}

/**
 * The tray menu for a state. On Linux the tray click is not guaranteed (spec R5, ADR-0001), so
 * every action is reachable from here; the main process re-checks each control anyway.
 */
export function buildTrayMenu(state: ControllerState, actions: TrayActions, options: TrayOptions = {}): MenuEntry[] {
  let head: MenuEntry[]
  if (!state.dockerAvailable) {
    head = [{ label: `Docker unavailable${state.dockerReason === null ? '' : `: ${menuLabel(state.dockerReason)}`}`, enabled: false }]
  } else if (state.services.length === 0) {
    head = [{ label: 'No Compose project found', enabled: false }]
  } else {
    head = state.services.map((service) => serviceEntry(service, actions))
  }
  return [
    ...head,
    { type: 'separator' },
    { label: 'Open dashboard', click: () => { actions.openDashboard() } },
    ...(options.autostart === undefined
      ? []
      : [{ label: 'Start at login', type: 'checkbox' as const, checked: options.autostart, click: () => { actions.toggleAutostart() } }]),
    { label: 'Quit', click: () => { actions.quit() } }
  ]
}
