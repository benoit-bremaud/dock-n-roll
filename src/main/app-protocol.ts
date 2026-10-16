import { extname, resolve, sep } from 'node:path'

/** Custom scheme the packaged dashboard is served from (ADR-0009, diagram 15). */
export const APP_SCHEME = 'app'
const APP_HOST = 'dashboard'
export const APP_PAGE_URL = `${APP_SCHEME}://${APP_HOST}/index.html`

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
}

/** Content-Type for a served file; unknown extensions are opaque bytes. */
export function mimeTypeOf(path: string): string {
  return MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

function decodedPath(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return null
  }
}

/**
 * Maps an `app://dashboard/...` URL to a file under `rootDir`, or `null` when it is any other
 * URL or could leave `rootDir`. Decoded once; a path still holding `%` (double encoding), `\`,
 * NUL, an empty or `..` segment is refused before the normalised containment check.
 */
export function resolveRendererFile(requestUrl: string, rootDir: string): string | null {
  if (!URL.canParse(requestUrl)) return null
  const url = new URL(requestUrl)
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) return null
  const path = decodedPath(url.pathname)
  if (path === null || /[%\\\0]/.test(path)) return null
  const segments = (path === '/' ? '/index.html' : path).slice(1).split('/')
  if (segments.some((segment) => segment === '' || segment === '..' || segment === '.')) return null
  const root = resolve(rootDir)
  const file = resolve(root, ...segments)
  return file.startsWith(root + sep) ? file : null
}

/** Reads a file's bytes; injected so the handler is tested without the file system. */
export type ReadFile = (path: string) => Promise<Uint8Array>

/** The `protocol.handle` callback: the confined file with its MIME type, else 404. */
export function createAppProtocolHandler(rootDir: string, readFile: ReadFile): (request: Request) => Promise<Response> {
  return async (request) => {
    const file = resolveRendererFile(request.url, rootDir)
    if (file === null) return new Response(null, { status: 404 })
    try {
      const bytes = await readFile(file)
      return new Response(bytes, { status: 200, headers: { 'content-type': mimeTypeOf(file), 'x-content-type-options': 'nosniff' } })
    } catch (error: unknown) {
      // A missing file is a plain 404; anything else (permissions, broken asar) is logged.
      const code = (error as { code?: unknown } | null)?.code
      if (code !== 'ENOENT' && code !== 'EISDIR') console.error('dock-n-roll: cannot serve', file, error)
      return new Response(null, { status: 404 })
    }
  }
}
