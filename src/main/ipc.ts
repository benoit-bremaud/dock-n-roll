import { ipcMain, shell, type BrowserWindow } from 'electron'
import { IPC, type BackgroundView, type ControllerState } from '../shared/ipc'
import type { ServiceController } from './controller/service-controller'

// The renderer is untrusted input (contextIsolation, sandbox): every handler validates its
// argument, and the controller re-checks the derived controls before acting (diagram 07).

function asId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length < 4096 ? value : null
}

function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export function registerIpc(controller: ServiceController, listBackground: () => Promise<BackgroundView>): void {
  ipcMain.handle(IPC.getState, (): ControllerState => controller.state())
  ipcMain.handle(IPC.start, async (_event, id: unknown) => {
    const valid = asId(id)
    if (valid !== null) await controller.start(valid)
  })
  ipcMain.handle(IPC.stop, async (_event, id: unknown) => {
    const valid = asId(id)
    if (valid !== null) await controller.stop(valid)
  })
  ipcMain.handle(IPC.openUrl, async (_event, id: unknown) => {
    const valid = asId(id)
    const url = valid === null ? null : controller.urlOf(valid)
    // Already validated by the pin file (spec R6); checked again right before leaving the app.
    if (url !== null && isHttpUrl(url)) await shell.openExternal(url)
  })
  ipcMain.handle(IPC.listBackground, () => listBackground())
}

/** Pushes every new state to the dashboard window, when it exists. */
export function pushStateTo(window: () => BrowserWindow | null, state: ControllerState): void {
  const target = window()
  if (target !== null && !target.isDestroyed()) target.webContents.send(IPC.stateChanged, state)
}
