import { join } from 'node:path'

export interface ResourceContext {
  readonly isPackaged: boolean
  /** `process.resourcesPath`: holds `extraResources`, outside the asar (ADR-0006). */
  readonly resourcesPath: string
  /** Directory of the bundled main script (`out/main`). */
  readonly mainDir: string
}

/** The tray icon: shipped as an extra resource when packaged, read from the repository otherwise. */
export function trayIconPath(context: ResourceContext): string {
  return context.isPackaged ? join(context.resourcesPath, 'tray-icon.png') : join(context.mainDir, '../../resources/tray-icon.png')
}

/** The dashboard window icon (X11 and dev; GNOME on Wayland reads the `.desktop` icon instead). */
export function appIconPath(context: ResourceContext): string {
  return context.isPackaged ? join(context.resourcesPath, 'app-icon.png') : join(context.mainDir, '../../resources/icons/256x256.png')
}
