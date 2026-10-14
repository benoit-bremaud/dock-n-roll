import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { autostartEntry, isAutostartEnabled, setAutostart } from './autostart'

describe('autostartEntry — XDG autostart desktop file (ADR-0006)', () => {
  it('runs the installed executable at login', () => {
    expect(autostartEntry('/opt/dock-n-roll/dock-n-roll')).toBe(
      ['[Desktop Entry]', 'Type=Application', 'Name=dock-n-roll', 'Comment=Start and stop local Docker Compose projects from the top bar', 'Exec=/opt/dock-n-roll/dock-n-roll', 'Terminal=false', 'X-GNOME-Autostart-enabled=true', ''].join('\n')
    )
  })

  it('quotes an executable path with spaces or reserved characters, as the desktop entry spec requires', () => {
    expect(autostartEntry('/opt/my apps/dock "n" roll')).toContain('Exec="/opt/my apps/dock \\"n\\" roll"')
  })

  it('refuses a path that is not absolute or holds a newline', () => {
    expect(() => autostartEntry('dock-n-roll')).toThrow()
    expect(() => autostartEntry('/opt/x\nExec=/bin/sh')).toThrow()
  })
})

describe('setAutostart / isAutostartEnabled', () => {
  let home: string
  let file: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'dock-n-roll-autostart-'))
    file = join(home, '.config', 'autostart', 'dock-n-roll.desktop')
  })

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('writes the entry, creating the autostart directory, and removes it again', async () => {
    expect(await isAutostartEnabled(file)).toBe(false)

    await setAutostart(file, true, '/opt/dock-n-roll/dock-n-roll')
    expect(readFileSync(file, 'utf8')).toBe(autostartEntry('/opt/dock-n-roll/dock-n-roll'))
    expect(await isAutostartEnabled(file)).toBe(true)

    await setAutostart(file, false, '/opt/dock-n-roll/dock-n-roll')
    expect(existsSync(file)).toBe(false)
    expect(await isAutostartEnabled(file)).toBe(false)
  })

  it('treats removing an absent entry as done', async () => {
    await expect(setAutostart(file, false, '/opt/x')).resolves.toBeUndefined()
  })
})
