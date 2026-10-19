import { describe, expect, it } from 'vitest'
import { appIconPath, trayIconPath } from './resources'

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

describe('appIconPath — dashboard window icon (#47)', () => {
  it('reads the packaged 256 px icon from the resources directory', () => {
    expect(appIconPath({ isPackaged: true, resourcesPath: '/opt/dock-n-roll/resources', mainDir: '/x' })).toBe('/opt/dock-n-roll/resources/app-icon.png')
  })

  it('reads the repository icon in dev and preview', () => {
    expect(appIconPath({ isPackaged: false, resourcesPath: '/x', mainDir: '/repo/out/main' })).toBe('/repo/resources/icons/256x256.png')
  })
})
