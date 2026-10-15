import { describe, expect, it } from 'vitest'
import { trayIconPath } from './resources'

describe('trayIconPath — resources outside the asar (ADR-0006)', () => {
  it('reads the packaged icon from the resources directory', () => {
    expect(trayIconPath({ isPackaged: true, resourcesPath: '/opt/dock-n-roll/resources', mainDir: '/opt/dock-n-roll/resources/app.asar/out/main' })).toBe(
      '/opt/dock-n-roll/resources/tray-icon.png'
    )
  })

  it('reads the repository icon in dev and preview', () => {
    expect(trayIconPath({ isPackaged: false, resourcesPath: '/x', mainDir: '/repo/out/main' })).toBe('/repo/resources/tray-icon.png')
  })
})
