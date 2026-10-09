import { join } from 'node:path'
import { app, BrowserWindow, Menu, nativeImage, session, Tray } from 'electron'

const TRAY_ICON_PATH = join(__dirname, '../../resources/tray-icon.png')

let dashboard: BrowserWindow | null = null
// Kept at module level: a garbage-collected Tray disappears from the top bar.
let tray: Tray | null = null
// Set on any quit (tray item, logout, SIGTERM): lets the dashboard close for real instead of hiding.
let isQuitting = false

function createDashboard(): BrowserWindow {
  const window = new BrowserWindow({
    width: 720,
    height: 520,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  // The renderer only ever shows the bundled page: no navigation, no new windows.
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Closing hides the dashboard: the app lives in the top bar until "Quit".
  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      window.hide()
    }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServerUrl !== undefined) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

function showDashboard(): void {
  dashboard ??= createDashboard()
  dashboard.show()
  dashboard.focus()
}

function createTray(): Tray {
  const trayIcon = new Tray(nativeImage.createFromPath(TRAY_ICON_PATH))
  trayIcon.setToolTip('dock-n-roll')
  // On Linux the tray click is not guaranteed to be a left click (ADR-0001):
  // every action is reachable from this menu.
  trayIcon.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open dashboard', click: showDashboard },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit()
        }
      }
    ])
  )
  return trayIcon
}

if (!app.requestSingleInstanceLock()) {
  // A second launch (autostart + manual start) must not add a second tray icon.
  app.quit()
} else {
  app.on('second-instance', showDashboard)
  app.on('before-quit', () => {
    // Emitted before windows close, whatever triggered the quit.
    isQuitting = true
    tray?.destroy()
  })
  // A tray app keeps running with no window open.
  app.on('window-all-closed', () => undefined)
  void app.whenReady().then(() => {
    // The dashboard needs no browser permission (camera, notifications, ...): deny them all.
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false)
    })
    session.defaultSession.setPermissionCheckHandler(() => false)
    // A hidden default menu still opens with Alt (Reload, Toggle DevTools): remove it in builds.
    if (app.isPackaged) {
      Menu.setApplicationMenu(null)
    }
    tray = createTray()
  })
}
