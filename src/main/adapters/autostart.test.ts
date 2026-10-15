import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { autostartEntry, isAutostartEnabled, setAutostart } from './autostart'

const execLine = (path: string): string | undefined => autostartEntry(path).split('\n').find((line) => line.startsWith('Exec='))

describe('autostartEntry — XDG autostart desktop file (ADR-0006)', () => {
  it('runs the installed executable at login, outside a terminal, enabled for GNOME', () => {
    const lines = autostartEntry('/opt/dock-n-roll/dock-n-roll').split('\n')

    expect(lines[0]).toBe('[Desktop Entry]')
    expect(lines).toEqual(expect.arrayContaining(['Type=Application', 'Exec=/opt/dock-n-roll/dock-n-roll', 'Terminal=false', 'X-GNOME-Autostart-enabled=true']))
  })

  // The spec unescapes the value as a string first (\\ → \), then applies the Exec quoting
  // rules (\" \` \$ \\ inside quotes), and expands % field codes even inside quotes.
  it.each([
    ['/opt/my apps/dock', 'Exec="/opt/my apps/dock"'],
    ['/opt/dock "n" roll', 'Exec="/opt/dock \\\\"n\\\\" roll"'],
    ['/opt/a\\b', 'Exec="/opt/a\\\\\\\\b"'],
    ['/opt/$HOME/x', 'Exec="/opt/\\\\$HOME/x"'],
    ['/opt/`id`/x', 'Exec="/opt/\\\\`id\\\\`/x"'],
    ['/opt/a%f/x', 'Exec="/opt/a%%f/x"']
  ])('escapes %s per the desktop entry spec', (path, line) => {
    expect(execLine(path)).toBe(line)
  })

  it.each([
    ['', 'empty'],
    ['dock-n-roll', 'relative'],
    ['/opt/x\nExec=/bin/sh', 'newline'],
    ['/opt/x\rExec=/bin/sh', 'carriage return'],
    ['/opt/x\0y', 'NUL'],
    ['/opt/x\ty', 'tab']
  ])('refuses a %j path (%s)', (path) => {
    expect(() => autostartEntry(path)).toThrow(/not an absolute executable path/)
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

  it('is off when there is no entry', async () => {
    expect(await isAutostartEnabled(file)).toBe(false)
  })

  it('writes a world-readable entry, creating the autostart directory', async () => {
    await setAutostart(file, true, '/opt/dock-n-roll/dock-n-roll')

    expect(readFileSync(file, 'utf8')).toBe(autostartEntry('/opt/dock-n-roll/dock-n-roll'))
    expect(statSync(file).mode & 0o777).toBe(0o644)
    expect(await isAutostartEnabled(file)).toBe(true)
  })

  it('replaces an existing entry', async () => {
    mkdirSync(join(home, '.config', 'autostart'), { recursive: true })
    writeFileSync(file, 'stale')

    await setAutostart(file, true, '/opt/dock-n-roll/dock-n-roll')

    expect(readFileSync(file, 'utf8')).toBe(autostartEntry('/opt/dock-n-roll/dock-n-roll'))
  })

  it('removes the entry', async () => {
    await setAutostart(file, true, '/opt/dock-n-roll/dock-n-roll')

    await setAutostart(file, false, '/opt/dock-n-roll/dock-n-roll')

    expect(existsSync(file)).toBe(false)
    expect(await isAutostartEnabled(file)).toBe(false)
  })

  it('treats removing an absent entry as done', async () => {
    await expect(setAutostart(file, false, '/opt/x')).resolves.toBeUndefined()
  })

  it('is off when the path is a directory, not an entry', async () => {
    mkdirSync(file, { recursive: true })

    expect(await isAutostartEnabled(file)).toBe(false)
  })
})
