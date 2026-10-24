// Runs in the renderer process, isolated from the page (contextIsolation + sandbox). Exposes the
// narrow API of class diagram 07 — ids in, views out; nothing else from Node or Electron.
import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type ControllerState, type DockNRollApi, type LogsState } from '../shared/ipc'

const api: DockNRollApi = {
  getState: () => ipcRenderer.invoke(IPC.getState) as Promise<ControllerState | null>,
  start: (id) => ipcRenderer.invoke(IPC.start, id) as Promise<void>,
  stop: (id) => ipcRenderer.invoke(IPC.stop, id) as Promise<void>,
  restart: (id) => ipcRenderer.invoke(IPC.restart, id) as Promise<void>,
  startGroup: (name) => ipcRenderer.invoke(IPC.startGroup, name) as Promise<void>,
  stopGroup: (name) => ipcRenderer.invoke(IPC.stopGroup, name) as Promise<void>,
  openUrl: (id) => ipcRenderer.invoke(IPC.openUrl, id) as Promise<void>,
  listBackground: () => ipcRenderer.invoke(IPC.listBackground) as ReturnType<DockNRollApi['listBackground']>,
  onStateChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: ControllerState): void => {
      callback(state)
    }
    ipcRenderer.on(IPC.stateChanged, listener)
    return () => {
      ipcRenderer.removeListener(IPC.stateChanged, listener)
    }
  },
  openLogs: (serviceId, containerId) => ipcRenderer.invoke(IPC.openLogs, serviceId, containerId) as Promise<void>,
  closeLogs: () => ipcRenderer.invoke(IPC.closeLogs) as Promise<void>,
  onLogsChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: LogsState | null): void => {
      callback(state)
    }
    ipcRenderer.on(IPC.logsChanged, listener)
    return () => {
      ipcRenderer.removeListener(IPC.logsChanged, listener)
    }
  }
}

contextBridge.exposeInMainWorld('dockNRoll', api)
