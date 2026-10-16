import { beforeAll, describe, expect, it, vi } from 'vitest'
import { IPC, type ControllerState, type DockNRollApi } from '../shared/ipc'

type Listener = (event: unknown, state: ControllerState | null) => void

// Electron is the boundary: the exposed API and the renderer-side IPC are captured.
const electron = vi.hoisted(() => {
  const listeners = new Map<string, Set<Listener>>()
  return {
    exposed: new Map<string, unknown>(),
    listeners,
    invoke: vi.fn<(...args: unknown[]) => Promise<string>>(() => Promise.resolve('answer')),
    emit: (channel: string, state: ControllerState | null): void => {
      for (const listener of listeners.get(channel) ?? []) listener({}, state)
    }
  }
})
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (key: string, value: unknown) => electron.exposed.set(key, value) },
  ipcRenderer: {
    invoke: electron.invoke,
    on: (channel: string, listener: Listener) => {
      const set = electron.listeners.get(channel) ?? new Set()
      electron.listeners.set(channel, set.add(listener))
    },
    removeListener: (channel: string, listener: Listener) => electron.listeners.get(channel)?.delete(listener)
  }
}))

const STATE: ControllerState = { dockerAvailable: true, dockerReason: null, pinErrors: [], services: [], homeDir: '/home/me' }

describe('preload', () => {
  let api: DockNRollApi

  beforeAll(async () => {
    await import('./index')
    api = electron.exposed.get('dockNRoll') as DockNRollApi
  })

  it('exposes exactly the DockNRollApi on window.dockNRoll', () => {
    expect([...electron.exposed.keys()]).toEqual(['dockNRoll'])
    expect(Object.keys(api).sort()).toEqual(['closeLogs', 'getState', 'listBackground', 'onLogsChanged', 'onStateChanged', 'openLogs', 'openUrl', 'restart', 'start', 'stop'])
  })

  it.each([
    ['getState', () => api.getState(), [IPC.getState]],
    ['start', () => api.start('web'), [IPC.start, 'web']],
    ['stop', () => api.stop('web'), [IPC.stop, 'web']],
    ['restart', () => api.restart('web'), [IPC.restart, 'web']],
    ['openUrl', () => api.openUrl('web'), [IPC.openUrl, 'web']],
    ['listBackground', () => api.listBackground(), [IPC.listBackground]],
    ['openLogs', () => api.openLogs('web', 'c1'), [IPC.openLogs, 'web', 'c1']],
    ['closeLogs', () => api.closeLogs(), [IPC.closeLogs]]
  ] as const)('%s invokes its channel with the id only', async (_name, call, expected) => {
    electron.invoke.mockClear()

    await expect(call()).resolves.toBe('answer')

    expect(electron.invoke).toHaveBeenCalledExactlyOnceWith(...expected)
  })

  it('delivers pushed states until unsubscribed, without the Electron event', () => {
    const callback = vi.fn()
    const unsubscribe = api.onStateChanged(callback)

    electron.emit(IPC.stateChanged, STATE)
    unsubscribe()
    electron.emit(IPC.stateChanged, STATE)

    expect(callback).toHaveBeenCalledExactlyOnceWith(STATE)
    expect(electron.listeners.get(IPC.stateChanged)?.size).toBe(0)
  })

  it('delivers pushed logs states, null included, until unsubscribed', () => {
    const callback = vi.fn()
    const unsubscribe = api.onLogsChanged(callback)

    electron.emit(IPC.logsChanged, null)
    unsubscribe()
    electron.emit(IPC.logsChanged, null)

    expect(callback).toHaveBeenCalledExactlyOnceWith(null)
    expect(electron.listeners.get(IPC.logsChanged)?.size).toBe(0)
  })
})
