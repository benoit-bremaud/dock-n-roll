import type { PinEntry, PinFileResult } from './types'

const KNOWN_KEYS = new Set(['workingDir', 'project', 'name', 'url', 'healthUrl', 'pinned', 'hidden'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `shell.openExternal` on a `file:` or custom scheme can launch local programs (spec R6). */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function validateEntry(raw: unknown, index: number, errors: string[]): PinEntry | null {
  const where = `services[${String(index)}]`
  if (!isRecord(raw)) {
    errors.push(`${where}: expected a mapping`)
    return null
  }
  const { workingDir } = raw
  if (typeof workingDir !== 'string' || !workingDir.startsWith('/')) {
    errors.push(`${where}: workingDir must be an absolute path`)
    return null
  }

  const optionalText = (key: 'project' | 'name'): string | undefined => {
    const value = raw[key]
    if (value === undefined) return undefined
    if (typeof value === 'string' && value.trim() !== '') return value
    errors.push(`${where}.${key}: expected a non-empty string`)
    return undefined
  }
  const optionalUrl = (key: 'url' | 'healthUrl'): string | undefined => {
    const value = raw[key]
    if (value === undefined) return undefined
    if (typeof value === 'string' && isHttpUrl(value)) return value
    errors.push(`${where}.${key}: only http and https URLs are allowed`)
    return undefined
  }
  const flag = (key: 'pinned' | 'hidden'): boolean => {
    const value = raw[key]
    if (value === undefined) return false
    if (typeof value === 'boolean') return value
    errors.push(`${where}.${key}: expected true or false`)
    return false
  }

  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) {
      errors.push(`${where}.${key}: unknown key`)
    }
  }

  const project = optionalText('project')
  const name = optionalText('name')
  const url = optionalUrl('url')
  const healthUrl = optionalUrl('healthUrl')
  return {
    workingDir,
    ...(project === undefined ? {} : { project }),
    ...(name === undefined ? {} : { name }),
    ...(url === undefined ? {} : { url }),
    ...(healthUrl === undefined ? {} : { healthUrl }),
    pinned: flag('pinned'),
    hidden: flag('hidden')
  }
}

/**
 * Validates the already-parsed pin file (spec §8). Never throws: invalid entries are dropped,
 * invalid fields are ignored, and each problem is reported in `errors`.
 */
export function validatePinFile(document: unknown): PinFileResult {
  if (document === null || document === undefined) {
    return { entries: [], errors: [] }
  }
  if (!isRecord(document) || !Array.isArray(document['services'])) {
    return { entries: [], errors: ['expected a mapping with a `services` list'] }
  }
  const errors: string[] = []
  const entries = document['services']
    .map((raw: unknown, index) => validateEntry(raw, index, errors))
    .filter((entry): entry is PinEntry => entry !== null)
  return { entries, errors }
}
