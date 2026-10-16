import { describe, expect, it } from 'vitest'
import { isTrustedSender, type SenderEvent } from './trusted-sender'

const PAGE_URL = 'app://dashboard/index.html'
const dashboard = { id: 'dashboard' }
const top = { parent: null, url: PAGE_URL }

function event(overrides: Partial<SenderEvent> = {}): SenderEvent {
  return { sender: dashboard, senderFrame: top, ...overrides }
}

describe('isTrustedSender', () => {
  const packaged = { kind: 'app', url: PAGE_URL } as const

  it('accepts the top frame of the dashboard on the bundled page', () => {
    expect(isTrustedSender(event(), dashboard, packaged)).toBe(true)
  })

  it('refuses when the dashboard window does not exist', () => {
    expect(isTrustedSender(event(), null, packaged)).toBe(false)
  })

  it('refuses another webContents, even on the same page', () => {
    expect(isTrustedSender(event({ sender: { id: 'other' } }), dashboard, packaged)).toBe(false)
  })

  it('refuses a disposed frame', () => {
    expect(isTrustedSender(event({ senderFrame: null }), dashboard, packaged)).toBe(false)
  })

  it('refuses a subframe of the dashboard', () => {
    expect(isTrustedSender(event({ senderFrame: { parent: top, url: PAGE_URL } }), dashboard, packaged)).toBe(false)
  })

  it('refuses any other URL, including one that only starts like the page', () => {
    for (const url of [`${PAGE_URL}.evil.html`, 'app://dashboard/other.html', 'file:///tmp/index.html', 'https://example.com/']) {
      expect(isTrustedSender(event({ senderFrame: { parent: null, url } }), dashboard, packaged)).toBe(false)
    }
  })

  it('accepts any page of the dev server in development, and nothing else', () => {
    const dev = { kind: 'devServer', url: 'http://localhost:5173' } as const
    const at = (url: string): boolean => isTrustedSender(event({ senderFrame: { parent: null, url } }), dashboard, dev)
    expect(at('http://localhost:5173/')).toBe(true)
    expect(at(PAGE_URL)).toBe(false)
    expect(at('https://example.com/')).toBe(false)
  })

  it('compares the dev server origin, not a string prefix', () => {
    const dev = { kind: 'devServer', url: 'http://localhost:5173' } as const
    for (const url of ['http://localhost:51730/', 'http://localhost:5173.evil.com/', 'not a url']) {
      expect(isTrustedSender(event({ senderFrame: { parent: null, url } }), dashboard, dev)).toBe(false)
    }
  })
})
