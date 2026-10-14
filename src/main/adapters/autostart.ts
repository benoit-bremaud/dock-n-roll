import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

// XDG autostart (ADR-0006): GNOME runs every `.desktop` file of ~/.config/autostart at login.
// Electron's setLoginItemSettings does nothing on Linux, so the app manages that file itself.

/** Desktop Entry spec: quote an Exec argument holding spaces or reserved characters. */
function execArgument(path: string): string {
  if (/^[A-Za-z0-9/._+-]+$/.test(path)) return path
  return `"${path.replace(/[\\"`$]/g, (char) => `\\${char}`)}"`
}

/**
 * The autostart entry for the installed executable. Throws on a relative path or a newline,
 * which would let a crafted path inject another key such as a second `Exec=`.
 */
export function autostartEntry(executablePath: string): string {
  if (!executablePath.startsWith('/') || /[\r\n]/.test(executablePath)) {
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

export async function isAutostartEnabled(entryPath: string): Promise<boolean> {
  try {
    return (await stat(entryPath)).isFile()
  } catch {
    return false
  }
}

/** Writes or removes the entry; removing an absent entry is not an error. */
export async function setAutostart(entryPath: string, enabled: boolean, executablePath: string): Promise<void> {
  if (enabled) {
    await mkdir(dirname(entryPath), { recursive: true })
    await writeFile(entryPath, autostartEntry(executablePath), { mode: 0o644 })
  } else {
    await rm(entryPath, { force: true })
  }
}
