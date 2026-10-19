import { chmod, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

// XDG autostart (ADR-0006): GNOME runs every `.desktop` file of ~/.config/autostart at login.
// Electron's setLoginItemSettings does nothing on Linux, so the app manages that file itself.

/**
 * Desktop Entry spec, applied in reverse order of reading: `%` is doubled (field codes expand
 * even inside quotes), an argument holding other characters is quoted with `"` `` ` `` `$` `\`
 * backslash-escaped, then every backslash is doubled because the value is a string unescaped first.
 */
function execArgument(path: string): string {
  if (/^[A-Za-z0-9/._+-]+$/.test(path)) return path
  const quoted = `"${path.replace(/%/g, '%%').replace(/[\\"`$]/g, (char) => `\\${char}`)}"`
  return quoted.replace(/\\/g, '\\\\')
}

/**
 * The autostart entry for the installed executable. Throws on a relative path or a control
 * character, which would let a crafted path inject another key such as a second `Exec=`.
 */
export function autostartEntry(executablePath: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
  if (!executablePath.startsWith('/') || /[\x00-\x1f\x7f]/.test(executablePath)) {
    throw new Error(`not an absolute executable path: ${JSON.stringify(executablePath)}`)
  }
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=dock-n-roll',
    'Comment=Start and stop local Docker Compose projects from the top bar',
    `Exec=${execArgument(executablePath)}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    ''
  ].join('\n')
}

/**
 * Whether our entry exists. An entry disabled by another tool (`Hidden=true`) still reads as on.
 * Only a missing entry reads as off: any other error (EACCES…) is thrown, so an unreadable
 * setting is never shown as "off".
 */
export async function isAutostartEnabled(entryPath: string): Promise<boolean> {
  try {
    return (await stat(entryPath)).isFile()
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return false
    throw error
  }
}

/** Writes or removes the entry; removing an absent entry is not an error. */
export async function setAutostart(entryPath: string, enabled: boolean, executablePath: string): Promise<void> {
  if (enabled) {
    await mkdir(dirname(entryPath), { recursive: true })
    // Written aside then renamed: GNOME never reads half an entry, and the mode is applied even
    // when the entry already exists (`writeFile` only sets it on creation).
    const temporary = `${entryPath}.tmp`
    try {
      await writeFile(temporary, autostartEntry(executablePath))
      await chmod(temporary, 0o644)
      await rename(temporary, entryPath)
    } catch (error) {
      await rm(temporary, { force: true })
      throw error
    }
  } else {
    await rm(entryPath, { force: true })
  }
}
