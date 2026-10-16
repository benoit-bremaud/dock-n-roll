import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { IPC, type BackgroundView, type ControllerState } from '../shared/ipc'
import type { ServiceController } from './controller/service-controller'
import { pushStateTo, registerIpc } from './ipc'

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
    onChange: () => () => undefined,
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

  beforeEach(() => {
    electron.handlers.clear()
    electron.openExternal.mockClear()
    const made = makeController()
    controller = made.spies
    registerIpc(made.controller, () => Promise.resolve(BACKGROUND), (event) => event === TRUSTED)
  })

  it('registers one handler per invoke channel', () => {
    expect([...electron.handlers.keys()].sort()).toEqual(
      [IPC.getState, IPC.start, IPC.stop, IPC.restart, IPC.openUrl, IPC.listBackground].sort()
    )
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
