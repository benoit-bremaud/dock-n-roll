import { join } from 'node:path'
import { app, BrowserWindow, Menu, nativeImage, session, shell, Tray, type MenuItemConstructorOptions } from 'electron'
import { resolveProjectName, runCompose } from './adapters/compose-runner'
import { observeDocker } from './adapters/docker-observer'
import { filesExist } from './adapters/file-probe'
import { probeHealth } from './adapters/health-probe'
import { openPinFileStore } from './adapters/pin-file-store'
import { scanListeningPorts } from './adapters/port-scanner'
import { listBackground } from './controller/background-monitor'
import { dockerSocketPath } from './controller/docker-socket'
import { createServiceController, type ServiceController } from './controller/service-controller'
import { buildTrayMenu, type MenuEntry } from './controller/tray-menu'
import { pushStateTo, registerIpc } from './ipc'
import type { ControllerState } from '../shared/ipc'

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

function toElectron(entries: readonly MenuEntry[]): MenuItemConstructorOptions[] {
  return entries.map(({ submenu, ...entry }) => (submenu === undefined ? { ...entry } : { ...entry, submenu: toElectron(submenu) }))
}

function renderTray(trayIcon: Tray, controller: ServiceController, state: ControllerState): void {
  // On Linux the tray click is not guaranteed to be a left click (ADR-0001): every action is
  // in this menu, rebuilt on each state change.
  const entries = buildTrayMenu(state, {
    start: (id) => void controller.start(id),
    stop: (id) => void controller.stop(id),
    openUrl: (id) => {
      const url = controller.urlOf(id)
      if (url !== null) void shell.openExternal(url)
    },
    openDashboard: showDashboard,
    quit: () => {
      app.quit()
    }
  })
  trayIcon.setContextMenu(Menu.buildFromTemplate(toElectron(entries)))
}

/** Composition root: real adapters into the controller, controller into IPC and the tray. */
async function start(): Promise<void> {
  const socketPath = dockerSocketPath(process.env)
  const controller = await createServiceController({
    socketPath,
    pinFilePath: join(app.getPath('appData'), 'dock-n-roll', 'services.yaml'),
    observeDocker,
    openPinFileStore,
    runCompose,
    resolveProjectName,
    filesExist,
    probeHealth,
    schedule: (run, delayMs) => {
      const timer = setTimeout(run, delayMs)
      return () => {
        clearTimeout(timer)
      }
    }
  })
  registerIpc(controller, () => listBackground(controller.containers(), scanListeningPorts))
  const trayIcon = new Tray(nativeImage.createFromPath(TRAY_ICON_PATH))
  trayIcon.setToolTip('dock-n-roll')
  tray = trayIcon
  renderTray(trayIcon, controller, controller.state())
  controller.onChange((state) => {
    renderTray(trayIcon, controller, state)
    pushStateTo(() => dashboard, state)
  })
  app.on('before-quit', () => {
    controller.dispose()
  })
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
    void start()
  })
}
