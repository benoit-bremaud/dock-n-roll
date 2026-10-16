import { beforeEach, describe, expect, it, vi } from 'vitest'
import { escapeMarkup, showNotification } from './notifier'

// Electron glue (like ipc.ts), kept out of adapters/ by the lint rule. Electron is the boundary: the Notification class is replaced by a recorder.
const electron = vi.hoisted(() => ({ supported: true, shown: [] as { title: string; body: string }[] }))
vi.mock('electron', () => ({
  Notification: class {
    static isSupported(): boolean {
      return electron.supported
    }
    constructor(private readonly options: { title: string; body: string }) {}
    show(): void {
      electron.shown.push(this.options)
    }
  }
}))

describe('escapeMarkup', () => {
  it('escapes the characters GNOME reads as body markup', () => {
    expect(escapeMarkup('<b>a</b> & "b"')).toBe('&lt;b&gt;a&lt;/b&gt; &amp; "b"')
  })
})

describe('showNotification', () => {
  beforeEach(() => {
    electron.shown = []
    electron.supported = true
  })

  it('shows the title as is and the body escaped', () => {
    showNotification('Blog <dev>', 'web <exited>')

    expect(electron.shown).toEqual([{ title: 'Blog <dev>', body: 'web &lt;exited&gt;' }])
  })

  it('does nothing where notifications are not supported', () => {
    electron.supported = false

    showNotification('Blog', 'web exited')

    expect(electron.shown).toEqual([])
  })
})
