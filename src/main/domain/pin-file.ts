import { isValidProjectName, normalizeAbsolutePath } from './names'
import type { PinEntry, PinFileResult } from './types'

const KNOWN_KEYS = new Set(['workingDir', 'project', 'name', 'url', 'healthUrl', 'pinned', 'hidden', 'groups'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Normalized `http:` / `https:` URL, or `null`. Other schemes can launch local programs through
 * `shell.openExternal` (spec R6); credentials in a URL only serve misleading links.
 */
function toHttpUrl(value: string): string | null {
  try {
    const url = new URL(value)
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:'
    return isHttp && url.username === '' && url.password === '' ? url.href : null
  } catch {
    return null
  }
}

function validateEntry(raw: unknown, where: string, errors: string[]): PinEntry | null {
  if (!isRecord(raw)) {
    errors.push(`${where}: expected a mapping`)
    return null
  }
  const workingDir = typeof raw['workingDir'] === 'string' ? normalizeAbsolutePath(raw['workingDir']) : null
  if (workingDir === null) {
    errors.push(`${where}: workingDir must be an absolute path`)
    return null
  }
  // `project` decides which projects the pin covers: dropping an invalid one would silently
  // widen the pin to the whole dir (e.g. hide every project instead of one).
  const rawProject = raw['project']
  if (rawProject !== undefined && (typeof rawProject !== 'string' || !isValidProjectName(rawProject))) {
    errors.push(`${where}.project: not a valid Compose project name; entry ignored`)
    return null
  }

  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) {
      errors.push(`${where}.${key}: unknown key`)
    }
  }
  const optionalName = (): string | undefined => {
    const value = raw['name']
    if (value === undefined) return undefined
    if (typeof value === 'string' && value.trim() !== '') return value
    errors.push(`${where}.name: expected a non-empty string`)
    return undefined
  }
  const optionalUrl = (key: 'url' | 'healthUrl'): string | undefined => {
    const value = raw[key]
    if (value === undefined) return undefined
    const url = typeof value === 'string' ? toHttpUrl(value) : null
    if (url !== null) return url
    errors.push(`${where}.${key}: only http and https URLs without credentials are allowed`)
    return undefined
  }
  const flag = (key: 'pinned' | 'hidden'): boolean => {
    const value = raw[key]
    if (value === undefined) return false
    if (typeof value === 'boolean') return value
    errors.push(`${where}.${key}: expected true or false`)
    return false
  }

  const optionalGroups = (): readonly string[] | undefined => {
    const value = raw['groups']
    if (value === undefined) return undefined
    const names = Array.isArray(value) ? value.map((item: unknown) => (typeof item === 'string' ? item.trim() : '')) : []
    if (names.length > 0 && !names.includes('')) return [...new Set(names)]
    errors.push(`${where}.groups: expected a list of non-empty names`)
    return undefined
  }

  const name = optionalName()
  const url = optionalUrl('url')
  const healthUrl = optionalUrl('healthUrl')
  const groups = optionalGroups()
  return {
    workingDir,
    ...(rawProject === undefined ? {} : { project: rawProject }),
    ...(name === undefined ? {} : { name }),
    ...(url === undefined ? {} : { url }),
    ...(healthUrl === undefined ? {} : { healthUrl }),
    ...(groups === undefined ? {} : { groups }),
    pinned: flag('pinned'),
    hidden: flag('hidden')
  }
}

/**
 * Validates the already-parsed pin file (spec §8). Never throws: invalid entries are dropped,
 * invalid fields are ignored, and each problem is reported in `errors` (shown to the owner).
 */
export function validatePinFile(document: unknown): PinFileResult {
  if (document === null || document === undefined) {
    return { entries: [], errors: [] }
  }
  if (!isRecord(document) || !Array.isArray(document['services'])) {
    return { entries: [], errors: ['expected a mapping with a `services` list'] }
  }
  const errors: string[] = []
  const entries: PinEntry[] = []
  const seen = new Set<string>()
  document['services'].forEach((raw: unknown, index) => {
    const where = `services[${String(index)}]`
    const entry = validateEntry(raw, where, errors)
    if (entry === null) return
    // Two entries for one (dir, project) would yield two services with the same id.
    const key = `${entry.workingDir}\0${entry.project ?? ''}`
    if (seen.has(key)) {
      errors.push(`${where}: duplicate of an earlier entry for the same workingDir and project; entry ignored`)
      return
    }
    seen.add(key)
    entries.push(entry)
  })
  return { entries, errors }
}
