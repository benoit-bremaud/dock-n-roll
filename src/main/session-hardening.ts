import type { Session, WebPreferences } from 'electron'

/** The part of an Electron session that `hardenSession` configures. */
export type HardenableSession = Pick<
  Session,
  'setSpellCheckerEnabled' | 'setSpellCheckerLanguages' | 'setPermissionRequestHandler' | 'setPermissionCheckHandler'
>

/**
 * Locks the session down before any window loads. The builtin spellchecker downloads a Hunspell
 * dictionary from a Google host on launch, which breaks R4 (local-only app, #95); the dashboard
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

/** Dashboard renderer preferences, minus the build-dependent preload path. */
export const DASHBOARD_WEB_PREFERENCES = {
  spellcheck: false,
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false
} as const satisfies WebPreferences
