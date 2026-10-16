import { ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { IPC, type BackgroundView, type ControllerState } from '../shared/ipc'
import type { ServiceController } from './controller/service-controller'

// The renderer is untrusted input (contextIsolation, sandbox): every handler validates its
// argument, and the controller re-checks the derived controls before acting (diagram 07).

function asId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length < 4096 ? value : null
}

/**
 * Registers the handlers of the channels in `IPC` (class diagram 07), once, at startup. Calls
 * from any frame other than the dashboard page are ignored (`isTrusted`), and so are invalid
 * ids: a refusal is silent, never an error sent back. `start` / `stop` / `restart` resolve once the
 * command ends; the outcome is only visible in the next pushed state.
 */
export function registerIpc(
  controller: ServiceController,
  listBackground: () => Promise<BackgroundView>,
  isTrusted: (event: IpcMainInvokeEvent) => boolean
): void {
  ipcMain.handle(IPC.getState, (event): ControllerState | null => (isTrusted(event) ? controller.state() : null))
  const command = (channel: string, act: (id: string) => Promise<void>): void => {
    ipcMain.handle(channel, async (event, id: unknown) => {
      const valid = asId(id)
      if (isTrusted(event) && valid !== null) await act(valid)
    })
  }
  command(IPC.start, (id) => controller.start(id))
  command(IPC.stop, (id) => controller.stop(id))
  command(IPC.restart, (id) => controller.restart(id))
  ipcMain.handle(IPC.openUrl, async (event, id: unknown) => {
    const valid = asId(id)
    // `urlOf` only returns the pin's http/https URL (spec R6), never one from the renderer.
    const url = isTrusted(event) && valid !== null ? controller.urlOf(valid) : null
    if (url !== null) await shell.openExternal(url)
  })
  ipcMain.handle(IPC.listBackground, (event) => (isTrusted(event) ? listBackground() : null))
}

/** Pushes every new state to the dashboard window, when it exists. */
export function pushStateTo(window: () => BrowserWindow | null, state: ControllerState): void {
  const target = window()
  if (target !== null && !target.isDestroyed()) target.webContents.send(IPC.stateChanged, state)
}
