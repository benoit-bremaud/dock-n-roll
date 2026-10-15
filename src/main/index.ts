import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, Menu, nativeImage, session, shell, Tray, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron'
import { isAutostartEnabled, setAutostart } from './adapters/autostart'
import { resolveProjectName, runCompose } from './adapters/compose-runner'
import { observeDocker } from './adapters/docker-observer'
import { filesExist } from './adapters/file-probe'
import { probeHealth } from './adapters/health-probe'
import { openPinFileStore } from './adapters/pin-file-store'
import { scanListeningPorts } from './adapters/port-scanner'
import { createAutostartToggle, type AutostartToggle } from './controller/autostart-toggle'
import { createBackgroundSource } from './controller/background-monitor'
import { dockerSocketPath } from './controller/docker-socket'
import { createServiceController, type ServiceController } from './controller/service-controller'
import { trayIconPath } from './controller/resources'
import { buildTrayMenu, type MenuEntry } from './controller/tray-menu'
import { pushStateTo, registerIpc } from './ipc'
import type { ControllerState } from '../shared/ipc'

const TRAY_ICON_PATH = trayIconPath({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath, mainDir: __dirname })
const RENDERER_FILE = join(__dirname, '../renderer/index.html')
const DEV_SERVER_URL = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined

/** IPC calls are accepted only from the dashboard page itself (top frame of our window). */
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame
  if (frame === null || frame.parent !== null || dashboard === null || event.sender !== dashboard.webContents) return false
  const url = frame.url
  return DEV_SERVER_URL !== undefined ? url.startsWith(DEV_SERVER_URL) : url === pathToFileURL(RENDERER_FILE).href
}

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

  if (DEV_SERVER_URL !== undefined) {
    void window.loadURL(DEV_SERVER_URL)
  } else {
    void window.loadFile(RENDERER_FILE)
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

/** XDG autostart entry; only offered in the installed app, whose executable is stable (ADR-0006). */
const AUTOSTART_ENTRY = join(app.getPath('appData'), 'autostart', 'dock-n-roll.desktop')
let autostart: AutostartToggle | undefined

function renderTray(trayIcon: Tray, controller: ServiceController, state: ControllerState): void {
  // On Linux the tray click is not guaranteed to be a left click (ADR-0001): every action is
  // in this menu, rebuilt on each state change.
  const entries = buildTrayMenu(state, {
    start: (id) => void controller.start(id),
    stop: (id) => void controller.stop(id),
    openUrl: (id) => {
      // `urlOf` only returns the pin's http/https URL (spec R6).
      const url = controller.urlOf(id)
      if (url !== null) void shell.openExternal(url)
    },
    openDashboard: showDashboard,
    quit: () => {
      app.quit()
    },
    toggleAutostart: () => void autostart?.toggle()
  }, autostart === undefined ? {} : { autostart: autostart.enabled() })
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
  registerIpc(controller, createBackgroundSource(() => controller.containers(), scanListeningPorts), isTrustedSender)
  const trayIcon = new Tray(nativeImage.createFromPath(TRAY_ICON_PATH))
  if (app.isPackaged) {
    autostart = createAutostartToggle({
      initial: await isAutostartEnabled(AUTOSTART_ENTRY),
      write: (enabled) => setAutostart(AUTOSTART_ENTRY, enabled, process.execPath),
      onChange: () => {
        renderTray(trayIcon, controller, controller.state())
      },
      onError: (error) => {
        console.error('dock-n-roll: autostart update failed', error)
        dialog.showErrorBox('Could not change Start at login', error instanceof Error ? error.message : String(error))
      }
    })
  }
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
    start().catch((error: unknown) => {
      // Without this the app would run with no tray and no window, and the single-instance
      // lock would block every relaunch.
      console.error('dock-n-roll: startup failed', error)
      dialog.showErrorBox('dock-n-roll could not start', error instanceof Error ? error.message : String(error))
      app.quit()
    })
  })
}
