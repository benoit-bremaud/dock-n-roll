import { stat } from 'node:fs/promises'
import { withTimeout } from './with-timeout'

/** Runs inside the recomputation chain: a hung mount must not hold it. */
const STAT_TIMEOUT_MS = 2000

async function isKind(path: string, kind: 'dir' | 'file'): Promise<boolean> {
  try {
    const info = await withTimeout(stat(path), STAT_TIMEOUT_MS, `stat ${path}`)
    return kind === 'dir' ? info.isDirectory() : info.isFile()
  } catch {
    // Gone, unreadable, hung or not a path: all mean the project cannot be started from here.
    return false
  }
}

/** Working dir and every config file still exist — the `filesExist` input of spec §4 `missing`. */
export async function filesExist(workingDir: string, configFiles: readonly string[]): Promise<boolean> {
  const checks = await Promise.all([isKind(workingDir, 'dir'), ...configFiles.map((file) => isKind(file, 'file'))])
  return checks.every(Boolean)
}
