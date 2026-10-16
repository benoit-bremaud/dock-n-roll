import { ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { IPC, type BackgroundView, type ControllerState, type LogsState } from '../shared/ipc'
import type { LogSession } from './controller/log-session'
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
  isTrusted: (event: IpcMainInvokeEvent) => boolean,
  logs: LogSession
): void {
  ipcMain.handle(IPC.getState, (event): ControllerState | null => (isTrusted(event) ? controller.state() : null))
  const command = (channel: (typeof IPC)[keyof typeof IPC], act: (id: string) => Promise<void>): void => {
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
  // UC7: the session checks the service exists and the container belongs to it.
  ipcMain.handle(IPC.openLogs, (event, serviceId: unknown, containerId: unknown) => {
    const valid = asId(serviceId)
    if (isTrusted(event) && valid !== null) logs.open(valid, asId(containerId))
  })
  ipcMain.handle(IPC.closeLogs, (event) => {
    if (isTrusted(event)) logs.close()
  })
}

function sendTo(window: () => BrowserWindow | null, channel: string, payload: unknown): void {
  const target = window()
  if (target !== null && !target.isDestroyed()) target.webContents.send(channel, payload)
}

/** Pushes every new state to the dashboard window, when it exists. */
export function pushStateTo(window: () => BrowserWindow | null, state: ControllerState): void {
  sendTo(window, IPC.stateChanged, state)
}

/** Pushes the logs panel state (UC7), `null` once closed, to the dashboard window. */
export function pushLogsTo(window: () => BrowserWindow | null, state: LogsState | null): void {
  sendTo(window, IPC.logsChanged, state)
}
