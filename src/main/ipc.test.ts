import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { IPC, type BackgroundView, type ControllerState, type LogsState } from '../shared/ipc'
import type { LogSession } from './controller/log-session'
import type { ServiceController } from './controller/service-controller'
import { pushLogsTo, pushStateTo, registerIpc } from './ipc'

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

// Electron is the boundary: handlers are captured instead of registered on a real ipcMain.
const electron = vi.hoisted(() => ({ handlers: new Map<string, Handler>(), openExternal: vi.fn(() => Promise.resolve()) }))
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => electron.handlers.set(channel, handler) },
  shell: { openExternal: electron.openExternal }
}))

const STATE: ControllerState = { dockerAvailable: true, dockerReason: null, pinErrors: [], services: [], homeDir: '/home/me' }
const BACKGROUND: BackgroundView = { containers: [], ports: [] }
const TRUSTED = { trusted: true } as unknown as IpcMainInvokeEvent
const UNTRUSTED = { trusted: false } as unknown as IpcMainInvokeEvent

// Spies kept apart from the controller object, so assertions never read an unbound method.
function makeController() {
  const spies = {
    start: vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
    stop: vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
    restart: vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
    urlOf: vi.fn((id: string) => (id === 'web' ? 'http://localhost:3000/' : null))
  }
  const controller: ServiceController = {
    ...spies,
    state: () => STATE,
    containers: () => [],
    containersOf: () => null,
    onChange: () => () => undefined,
    onRecompute: () => () => undefined,
    dispose: () => undefined
  }
  return { controller, spies }
}

function invoke(channel: string, event: IpcMainInvokeEvent, ...args: unknown[]): unknown {
  const handler = electron.handlers.get(channel)
  if (handler === undefined) throw new Error(`no handler for ${channel}`)
  return handler(event, ...args)
}

describe('registerIpc', () => {
  let controller: ReturnType<typeof makeController>['spies']
  let logs: { open: ReturnType<typeof vi.fn<LogSession['open']>>; close: ReturnType<typeof vi.fn<LogSession['close']>> }

  beforeEach(() => {
    electron.handlers.clear()
    electron.openExternal.mockClear()
    const made = makeController()
    controller = made.spies
    logs = { open: vi.fn<LogSession['open']>(), close: vi.fn<LogSession['close']>() }
    const session: LogSession = { ...logs, refresh: () => undefined, onChange: () => () => undefined }
    registerIpc({ controller: made.controller, listBackground: () => Promise.resolve(BACKGROUND), isTrusted: (event) => event === TRUSTED, logs: session })
  })

  it('registers one handler per invoke channel', () => {
    expect([...electron.handlers.keys()].sort()).toEqual(
      [IPC.getState, IPC.start, IPC.stop, IPC.restart, IPC.openUrl, IPC.listBackground, IPC.openLogs, IPC.closeLogs].sort()
    )
  })

  it('opens the logs of a valid service id, with a valid container id or none (UC7)', async () => {
    await invoke(IPC.openLogs, TRUSTED, 'web', 'c1')
    await invoke(IPC.openLogs, TRUSTED, 'web', null)
    await invoke(IPC.openLogs, TRUSTED, 'web', 42)

    expect(logs.open.mock.calls).toEqual([['web', 'c1'], ['web', null], ['web', null]])
  })

  it('refuses logs to an untrusted caller or for an invalid service id, and closes for the dashboard only', async () => {
    await invoke(IPC.openLogs, UNTRUSTED, 'web', null)
    await invoke(IPC.openLogs, TRUSTED, '', null)
    await invoke(IPC.closeLogs, UNTRUSTED)
    expect(logs.open).not.toHaveBeenCalled()
    expect(logs.close).not.toHaveBeenCalled()

    await invoke(IPC.closeLogs, TRUSTED)
    expect(logs.close).toHaveBeenCalledOnce()
  })

  it('answers state and background to the dashboard, null to anyone else', async () => {
    expect(invoke(IPC.getState, TRUSTED)).toBe(STATE)
    await expect(invoke(IPC.listBackground, TRUSTED)).resolves.toBe(BACKGROUND)

    expect(invoke(IPC.getState, UNTRUSTED)).toBeNull()
    expect(invoke(IPC.listBackground, UNTRUSTED)).toBeNull()
  })

  it.each([IPC.start, IPC.stop, IPC.restart] as const)('%s forwards a valid id from the dashboard', async (channel) => {
    await invoke(channel, TRUSTED, 'web')

    const method = { [IPC.start]: controller.start, [IPC.stop]: controller.stop, [IPC.restart]: controller.restart }[channel]
    expect(method).toHaveBeenCalledWith('web')
  })

  it.each([IPC.start, IPC.stop, IPC.restart] as const)('%s silently refuses an untrusted caller or an invalid id', async (channel) => {
    for (const [event, id] of [
      [UNTRUSTED, 'web'],
      [TRUSTED, ''],
      [TRUSTED, 'x'.repeat(4096)],
      [TRUSTED, 42],
      [TRUSTED, { id: 'web' }],
      [TRUSTED, undefined]
    ] as const) {
      await expect(invoke(channel, event, id)).resolves.toBeUndefined()
    }

    expect(controller.start).not.toHaveBeenCalled()
    expect(controller.stop).not.toHaveBeenCalled()
    expect(controller.restart).not.toHaveBeenCalled()
  })

  it('accepts the longest valid id', async () => {
    await invoke(IPC.start, TRUSTED, 'x'.repeat(4095))

    expect(controller.start).toHaveBeenCalledOnce()
  })

  it('opens the pin URL looked up by id, never one sent by the renderer', async () => {
    await invoke(IPC.openUrl, TRUSTED, 'web')
    await invoke(IPC.openUrl, TRUSTED, 'https://evil.example/')

    expect(electron.openExternal).toHaveBeenCalledExactlyOnceWith('http://localhost:3000/')
  })

  it('does not even look the URL up for an untrusted caller', async () => {
    await invoke(IPC.openUrl, UNTRUSTED, 'web')

    expect(controller.urlOf).not.toHaveBeenCalled()
    expect(electron.openExternal).not.toHaveBeenCalled()
  })
})

describe('pushLogsTo', () => {
  it('sends the logs state, or null, on the logs-changed channel', () => {
    const send = vi.fn()
    const window = { isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow
    const logs: LogsState = { serviceId: 'web', containerId: null, containers: [], lines: [], ended: 'No container yet' }

    pushLogsTo(() => window, logs)
    pushLogsTo(() => window, null)
    pushLogsTo(() => null, null)

    expect(send.mock.calls).toEqual([[IPC.logsChanged, logs], [IPC.logsChanged, null]])
  })
})

describe('pushStateTo', () => {
  function makeWindow(destroyed: boolean): { window: BrowserWindow; send: ReturnType<typeof vi.fn> } {
    const send = vi.fn()
    const window = { isDestroyed: () => destroyed, webContents: { send } } as unknown as BrowserWindow
    return { window, send }
  }

  it('sends the state on the state-changed channel', () => {
    const { window, send } = makeWindow(false)

    pushStateTo(() => window, STATE)

    expect(send).toHaveBeenCalledExactlyOnceWith(IPC.stateChanged, STATE)
  })

  it('does nothing without a window or with a destroyed one', () => {
    const { window, send } = makeWindow(true)

    pushStateTo(() => null, STATE)
    pushStateTo(() => window, STATE)

    expect(send).not.toHaveBeenCalled()
  })
})
