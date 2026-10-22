// Shared validation rules for values that end up in `docker compose` arguments (spec R4).
// Pure string handling: the domain may not import node:path.

/** Compose's own project name rule: anything else is refused before it reaches the CLI. */
const PROJECT_NAME = /^[a-z0-9][a-z0-9_-]*$/

export function isValidProjectName(name: string): boolean {
  return PROJECT_NAME.test(name)
}

/**
 * The project name Compose derives from a directory when no `--project-name` is given:
 * lowercased, characters outside `[a-z0-9_-]` dropped, leading `_` / `-` stripped.
 * Returns `null` when nothing valid is left.
 */
export function defaultProjectName(workingDir: string): string | null {
  const base = workingDir.split('/').findLast((part) => part !== '') ?? ''
  const name = base.toLowerCase().replaceAll(/[^a-z0-9_-]/g, '').replace(/^[_-]+/, '')
  return isValidProjectName(name) ? name : null
}

/**
 * Absolute POSIX path with `.`, `..`, repeated and trailing slashes resolved, so that a pin
 * written `/home/x/` matches the Compose label `/home/x`. Returns `null` for a relative path
 * or a path containing NUL (which `execFile` would reject).
 */
export function normalizeAbsolutePath(path: string): string | null {
  if (!path.startsWith('/') || path.includes('\0')) {
    return null
  }
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      parts.pop()
    } else {
      parts.push(part)
    }
  }
  return `/${parts.join('/')}`
}
