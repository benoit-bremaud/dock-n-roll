import { stat } from 'node:fs/promises'
import type { MissingPath } from '../domain/types'
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

/**
 * The first of the working dir and its config files that is gone — the `filesExist` input of
 * spec §4 `missing`, plus what to name in the reason. The dir comes first: without it, every
 * config file inside is gone too. `null` when everything is there.
 */
export async function findMissingPath(workingDir: string, configFiles: readonly string[]): Promise<MissingPath | null> {
  const [dirOk, ...filesOk] = await Promise.all([isKind(workingDir, 'dir'), ...configFiles.map((file) => isKind(file, 'file'))])
  if (!dirOk) return { kind: 'folder', path: workingDir }
  const file = configFiles.find((_path, index) => !filesOk[index])
  return file === undefined ? null : { kind: 'compose file', path: file }
}
