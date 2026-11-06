import { describe, expect, it, vi } from 'vitest'
import { DASHBOARD_WEB_PREFERENCES, hardenSession, type HardenableSession } from './session-hardening'

// Electron is the boundary: the session is replaced by a recorder of the calls made on it.
function fakeSession() {
  return {
    setSpellCheckerEnabled: vi.fn<(enable: boolean) => void>(),
    setSpellCheckerLanguages: vi.fn<(languages: string[]) => void>(),
    setPermissionRequestHandler: vi.fn<HardenableSession['setPermissionRequestHandler']>(),
    setPermissionCheckHandler: vi.fn<HardenableSession['setPermissionCheckHandler']>()
  }
}

describe('hardenSession', () => {
  it('turns the builtin spellchecker off', () => {
    const session = fakeSession()
    hardenSession(session)
    expect(session.setSpellCheckerEnabled).toHaveBeenCalledWith(false)
  })

  // Disabling alone still lets the session fetch the locale dictionary: proven on the packaged build.
  it('clears the spellchecker languages, which is what stops the download (#95)', () => {
    const session = fakeSession()
    hardenSession(session)
    expect(session.setSpellCheckerLanguages).toHaveBeenCalledWith([])
  })

  it('denies every permission request and check', () => {
    const session = fakeSession()
    hardenSession(session)
    const callback = vi.fn()
    const requestHandler = session.setPermissionRequestHandler.mock.calls[0]?.[0]
    const checkHandler = session.setPermissionCheckHandler.mock.calls[0]?.[0]
    // @ts-expect-error -- the handlers ignore every argument but the callback.
    requestHandler?.(null, 'notifications', callback, {})
    expect(callback).toHaveBeenCalledWith(false)
    // @ts-expect-error -- the handler ignores its arguments.
    expect(checkHandler?.()).toBe(false)
  })
})

describe('DASHBOARD_WEB_PREFERENCES', () => {
  it('turns the spellchecker off and keeps the renderer isolated', () => {
    expect(DASHBOARD_WEB_PREFERENCES).toEqual({
      spellcheck: false,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    })
  })
})
