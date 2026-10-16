import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { APP_PAGE_URL, createAppProtocolHandler, mimeTypeOf, resolveRendererFile } from './app-protocol'

const ROOT = '/opt/dock-n-roll/resources/app.asar/out/renderer'

describe('resolveRendererFile', () => {
  it('serves a file under the renderer dir', () => {
    expect(resolveRendererFile('app://dashboard/index.html', ROOT)).toBe(join(ROOT, 'index.html'))
    expect(resolveRendererFile('app://dashboard/assets/index-abc.js', ROOT)).toBe(join(ROOT, 'assets/index-abc.js'))
  })

  it('serves index.html for the root and ignores query and hash', () => {
    expect(resolveRendererFile('app://dashboard/', ROOT)).toBe(join(ROOT, 'index.html'))
    expect(resolveRendererFile('app://dashboard/index.html?x=1#y', ROOT)).toBe(join(ROOT, 'index.html'))
  })

  it.each(['app://dashboard/../../etc/passwd', 'app://dashboard/%2e%2e/%2e%2e/etc/passwd'])(
    'keeps %s under the root (the URL parser collapses dot segments)',
    (url) => {
      expect(resolveRendererFile(url, ROOT)).toBe(join(ROOT, 'etc/passwd'))
    }
  )

  it.each([
    'app://dashboard/assets/..%2f..%2fetc/passwd',
    'app://dashboard/assets%5c..%5c..%5cetc',
    'app://dashboard/a%00.js',
    'app://dashboard/%252e%252e/etc',
    'app://dashboard//etc/passwd',
    'app://other/index.html',
    'app://dashboard:80/index.html',
    'file:///etc/passwd',
    'http://dashboard/index.html',
    'not a url'
  ])('refuses %s', (url) => {
    expect(resolveRendererFile(url, ROOT)).toBeNull()
  })
})

describe('mimeTypeOf', () => {
  it.each([
    ['index.html', 'text/html; charset=utf-8'],
    ['a.JS', 'text/javascript; charset=utf-8'],
    ['a.css', 'text/css; charset=utf-8'],
    ['a.svg', 'image/svg+xml'],
    ['a.png', 'image/png'],
    ['a.woff2', 'font/woff2'],
    ['a.exe', 'application/octet-stream'],
    ['Makefile', 'application/octet-stream']
  ])('%s is %s', (file, type) => {
    expect(mimeTypeOf(file)).toBe(type)
  })
})

describe('createAppProtocolHandler', () => {
  it('answers 200 with the bytes and the MIME type', async () => {
    const readFile = vi.fn().mockResolvedValue(Buffer.from('<html></html>'))
    const response = await createAppProtocolHandler(ROOT, readFile)(new Request(APP_PAGE_URL))
    expect(readFile).toHaveBeenCalledWith(join(ROOT, 'index.html'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.text()).toBe('<html></html>')
  })

  it('answers 404 without reading for a refused path', async () => {
    const readFile = vi.fn()
    const response = await createAppProtocolHandler(ROOT, readFile)(new Request('app://dashboard/..%2fsecret'))
    expect(response.status).toBe(404)
    expect(readFile).not.toHaveBeenCalled()
  })

  it('answers 404 for a missing file', async () => {
    const readFile = vi.fn().mockRejectedValue(Object.assign(new Error('nope'), { code: 'ENOENT' }))
    const response = await createAppProtocolHandler(ROOT, readFile)(new Request('app://dashboard/missing.js'))
    expect(response.status).toBe(404)
  })

  it('answers 404 and logs an unexpected read error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const readFile = vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }))
    const response = await createAppProtocolHandler(ROOT, readFile)(new Request(APP_PAGE_URL))
    expect(response.status).toBe(404)
    expect(log).toHaveBeenCalledOnce()
    log.mockRestore()
  })
})
