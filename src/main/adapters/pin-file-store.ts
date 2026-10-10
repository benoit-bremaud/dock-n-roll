import { watch, type FSWatcher } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { parse } from 'yaml'
import { validatePinFile } from '../domain/pin-file'
import type { PinFileResult } from '../domain/types'

/** Editors fire several events per save (write, rename, chmod): wait for the burst to end. */
const DEBOUNCE_MS = 100

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

/** Parses and validates the pin file text (spec §8). */
export function parsePinFileText(text: string): PinFileResult {
  const yaml = readYaml(text)
  return yaml.ok ? validatePinFile(yaml.value) : { entries: [], errors: [yaml.error] }
}

async function readPinFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

/**
 * Loads the pin file and keeps it current (spec §9 Q1). The **directory** is watched, not the
 * file: editors save by writing a temporary file and renaming it over the original, which a
 * watch on the file itself stops seeing. A missing file means no pins; invalid YAML keeps the
 * last valid pins and reports the error.
 */
export async function openPinFileStore(path: string, onChange: (result: PinFileResult) => void): Promise<PinFileStore> {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true })

  let result: PinFileResult = { entries: [], errors: [] }
  let closed = false
  let timer: NodeJS.Timeout | undefined

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

  await reload()
  const watcher: FSWatcher = watch(directory, (_event, filename) => {
    if (closed || (filename !== null && filename !== basename(path))) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      void reload().then(() => {
        if (!closed) onChange(result)
      })
    }, DEBOUNCE_MS)
  })

  return {
    current: () => result,
    close: () => {
      closed = true
      clearTimeout(timer)
      watcher.close()
    }
  }
}
