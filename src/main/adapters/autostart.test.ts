import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
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

  it('replaces an existing entry atomically, with the mode fixed and no temporary file left', async () => {
    mkdirSync(join(home, '.config', 'autostart'), { recursive: true })
    writeFileSync(file, 'stale', { mode: 0o600 })

    await setAutostart(file, true, '/opt/dock-n-roll/dock-n-roll')

    expect(readFileSync(file, 'utf8')).toBe(autostartEntry('/opt/dock-n-roll/dock-n-roll'))
    expect(statSync(file).mode & 0o777).toBe(0o644)
    expect(readdirSync(join(home, '.config', 'autostart'))).toEqual(['dock-n-roll.desktop'])
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

  // Root ignores permissions: the EACCES case is only meaningful for a normal user.
  it.skipIf(process.getuid?.() === 0)('reports an unreadable autostart directory instead of reading it as off', async () => {
    const directory = join(home, '.config', 'autostart')
    mkdirSync(directory, { recursive: true })
    chmodSync(directory, 0o000)

    try {
      await expect(isAutostartEnabled(file)).rejects.toThrow(/EACCES/)
    } finally {
      chmodSync(directory, 0o755)
    }
  })

  it('leaves no temporary file when the rename over the entry fails', async () => {
    mkdirSync(join(file, 'blocker'), { recursive: true })

    await expect(setAutostart(file, true, '/opt/dock-n-roll/dock-n-roll')).rejects.toThrow()
    expect(readdirSync(join(home, '.config', 'autostart'))).toEqual(['dock-n-roll.desktop'])
  })

  it('replaces a temporary file left by a crash, even a symlink, without following it', async () => {
    const directory = join(home, '.config', 'autostart')
    const target = join(home, 'target')
    mkdirSync(directory, { recursive: true })
    writeFileSync(target, 'untouched', { mode: 0o600 })
    symlinkSync(target, `${file}.tmp`)

    await setAutostart(file, true, '/opt/dock-n-roll/dock-n-roll')

    expect(readFileSync(target, 'utf8')).toBe('untouched')
    expect(statSync(target).mode & 0o777).toBe(0o600)
    expect(readdirSync(directory)).toEqual(['dock-n-roll.desktop'])
  })

  it('is off when a parent of the entry is a file', async () => {
    writeFileSync(join(home, '.config'), 'not a directory')

    expect(await isAutostartEnabled(file)).toBe(false)
  })
})
