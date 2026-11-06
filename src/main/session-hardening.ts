import type { Session, WebPreferences } from 'electron'

/** The part of an Electron session that `hardenSession` configures. */
export type HardenableSession = Pick<
  Session,
  'setSpellCheckerEnabled' | 'setSpellCheckerLanguages' | 'setPermissionRequestHandler' | 'setPermissionCheckHandler'
>

/**
 * Locks the session down; call it before any window loads. Even disabled, the builtin spellchecker
 * downloads a Hunspell dictionary from a Google host on launch unless its languages are cleared,
 * which breaks R4 (no remote input, #95); the dashboard
 * needs no browser permission (camera, notifications, ...), so they are all denied.
 */
export function hardenSession(session: HardenableSession): void {
  session.setSpellCheckerLanguages([])
  session.setSpellCheckerEnabled(false)
  session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  session.setPermissionCheckHandler(() => false)
}

/**
 * Dashboard renderer preferences, minus the build-dependent preload path. `spellcheck: false`
 * backs up `hardenSession` on purpose (defense in depth, #95).
 */
export const DASHBOARD_WEB_PREFERENCES = {
  spellcheck: false,
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false
} as const satisfies WebPreferences
