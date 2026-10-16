import { watch, type FSWatcher } from 'node:fs'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { parse } from 'yaml'
import { validatePinFile } from '../domain/pin-file'
import type { PinFileResult } from '../domain/types'
import { withTimeout } from './with-timeout'

/** Editors fire several events per save (write, rename, chmod): wait for the burst to end. */
const DEBOUNCE_MS = 100
/** A config dir on a stale network mount must not hang the store forever. */
const FS_TIMEOUT_MS = 5000
/** A re-arm that failed (directory not creatable, mount hung) is tried again after this. */
const REARM_RETRY_MS = 5000
/** A hand-written pin list is a few KiB: anything far larger is a mistake, not pins. */
export const MAX_PIN_FILE_BYTES = 64 * 1024
const KIB = 1024

export interface PinFileStore {
  /** Latest pins, with the errors of the latest read. */
  current(): PinFileResult
  close(): void
}

type YamlRead = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string }

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `services.yaml: ${message.split('\n')[0] ?? message}`
}

/** A YAML error — including an alias bomb, refused by `maxAliasCount` (ADR-0005) — never throws. */
function readYaml(text: string): YamlRead {
  try {
    return { ok: true, value: parse(text) }
  } catch (error) {
    return { ok: false, error: errorText(error) }
  }
}

/**
 * Parses and validates the pin file text (spec §8). Stateless: on a YAML error it returns no
 * entries — keeping the last valid pins is the store's job.
 */
export function parsePinFileText(text: string): PinFileResult {
  const yaml = readYaml(text)
  return yaml.ok ? validatePinFile(yaml.value) : { entries: [], errors: [yaml.error] }
}

async function readPinFile(path: string): Promise<string | null> {
  try {
    // Checked before reading, so a huge file is refused unread (ADR-0005). Best effort: a file
    // growing between stat and read is not caught — acceptable for the user's own config.
    const stats = await withTimeout(stat(path), FS_TIMEOUT_MS, `stat ${path}`)
    // A FIFO or device reports size 0 and would only fail at the read timeout.
    if (!stats.isFile()) throw new Error('not a regular file')
    if (stats.size > MAX_PIN_FILE_BYTES) {
      // Rounded up, so a file just over the cap never reads as "64 KiB".
      throw new Error(`file too large (${String(Math.ceil(stats.size / KIB))} KiB, max ${String(MAX_PIN_FILE_BYTES / KIB)} KiB)`)
    }
    return await withTimeout(readFile(path, 'utf8'), FS_TIMEOUT_MS, `read ${path}`)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

/** Creates the directory if needed and returns its inode, to tell a recreated one apart. */
async function ensureDirectory(directory: string): Promise<number> {
  await withTimeout(mkdir(directory, { recursive: true }), FS_TIMEOUT_MS, `mkdir ${directory}`)
  return (await withTimeout(stat(directory), FS_TIMEOUT_MS, `stat ${directory}`)).ino
}

/** Inode of the directory, or null when it is gone or unreachable. */
async function inodeOf(directory: string): Promise<number | null> {
  try {
    return (await withTimeout(stat(directory), FS_TIMEOUT_MS, `stat ${directory}`)).ino
  } catch {
    return null
  }
}

/**
 * Loads the pin file and keeps it current (spec §9 Q1). The **directory** is watched, not the
 * file: editors save by writing a temporary file and renaming it over the original, which a
 * watch on the file itself stops seeing. A missing file means no pins; invalid YAML keeps the
 * last valid pins and reports the error. Reloads run one at a time, so a slow read can never
 * overwrite a newer one. After each burst of events, if the directory reported its own removal
 * or its inode changed or is gone (even recreated within the debounce), it is recreated if
 * needed and watched again, with exactly one live watcher; a failed re-arm is retried after
 * `REARM_RETRY_MS`.
 * Every filesystem call is bounded by `FS_TIMEOUT_MS`.
 *
 * Known limit: a symlinked `services.yaml` is read, but edits made to its target are not seen
 * until the link itself changes or the app restarts.
 *
 * Rejects only if the directory cannot be created (or that hangs past `FS_TIMEOUT_MS`). `onChange` errors are logged, never fatal.
 */
export async function openPinFileStore(path: string, onChange: (result: PinFileResult) => void): Promise<PinFileStore> {
  const directory = dirname(path)
  const file = basename(path)
  let watchedInode = await ensureDirectory(directory)

  let result: PinFileResult = { entries: [], errors: [] }
  let closed = false
  let timer: NodeJS.Timeout | undefined
  let watcher: FSWatcher | undefined
  let retryTimer: NodeJS.Timeout | undefined
  /** What the current burst of events asks for, read and reset once it ends. */
  let burst = { reload: false, rearm: false }
  let rearming = false
  let chain = Promise.resolve()

  const reload = async (): Promise<void> => {
    let text: string | null
    try {
      text = await readPinFile(path)
    } catch (error) {
      result = { entries: result.entries, errors: [errorText(error)] }
      return
    }
    if (text === null) {
      result = { entries: [], errors: [] }
      return
    }
    const yaml = readYaml(text)
    // Unreadable YAML is usually a save in progress or a typo: keep the last valid pins.
    result = yaml.ok ? validatePinFile(yaml.value) : { entries: result.entries, errors: [yaml.error] }
  }

  const notify = (): void => {
    if (closed) return
    try {
      onChange(result)
    } catch (error) {
      console.error('dock-n-roll: pin file listener failed', error)
    }
  }

  const reloadAndNotify = (): void => {
    chain = chain.then(reload).then(notify, (error: unknown) => {
      console.error('dock-n-roll: pin file reload failed', error)
    })
  }

  const arm = (): void => {
    // Exactly one live watcher: the previous one is closed before a new one is opened.
    watcher?.close()
    watcher = watch(directory, (_event, filename) => {
      if (closed) return
      // `filename` can be null on some platforms: reload rather than miss a change.
      const concernsFile = filename === null || filename === file
      // Linux reports the watched directory's own removal under its name; its inode number can
      // be reused by a directory recreated at once, so the inode check alone would miss it.
      // A file named like its directory only costs a harmless extra re-arm.
      burst = { reload: burst.reload || concernsFile, rearm: burst.rearm || filename === basename(directory) }
      clearTimeout(timer)
      timer = setTimeout(checkAfterBurst, DEBOUNCE_MS)
    })
    watcher.on('error', () => {
      if (!closed) rearm()
    })
  }

  /** A removed or recreated directory leaves the watcher on a dead inode: re-arm, else reload. */
  const checkAfterBurst = (): void => {
    if (closed) return
    const wanted = burst
    burst = { reload: false, rearm: false }
    chain = chain.then(async () => {
      if (closed) return
      if (wanted.rearm || (await inodeOf(directory)) !== watchedInode) {
        rearm()
      } else if (wanted.reload) {
        reloadAndNotify()
      }
    })
  }

  const rearm = (): void => {
    if (rearming) return
    rearming = true
    watcher?.close()
    watcher = undefined
    chain = chain
      .then(async () => {
        watchedInode = await ensureDirectory(directory)
        if (!closed) {
          arm()
          reloadAndNotify()
        }
      })
      .catch((error: unknown) => {
        result = { entries: result.entries, errors: [errorText(error)] }
        notify()
        // Without a watcher no event would ever trigger another attempt.
        if (!closed) retryTimer = setTimeout(rearm, REARM_RETRY_MS)
      })
      .finally(() => {
        rearming = false
      })
  }

  await reload()
  arm()

  return {
    current: () => result,
    close: () => {
      closed = true
      clearTimeout(timer)
      clearTimeout(retryTimer)
      watcher?.close()
    }
  }
}
