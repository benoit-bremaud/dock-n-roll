import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, Menu, nativeImage, session, shell, Tray, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron'
import { isAutostartEnabled, setAutostart } from './adapters/autostart'
import { resolveProjectName, runCompose } from './adapters/compose-runner'
import { observeDocker } from './adapters/docker-observer'
import { filesExist } from './adapters/file-probe'
import { showNotification } from './notifier'
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
import { isTrustedSender, type DashboardOrigin } from './trusted-sender'
import type { ControllerState } from '../shared/ipc'

const TRAY_ICON_PATH = trayIconPath({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath, mainDir: __dirname })
const RENDERER_FILE = join(__dirname, '../renderer/index.html')
const DEV_SERVER_URL = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined

const DASHBOARD_ORIGIN: DashboardOrigin =
  DEV_SERVER_URL !== undefined ? { kind: 'devServer', url: DEV_SERVER_URL } : { kind: 'file', url: pathToFileURL(RENDERER_FILE).href }

let dashboard: BrowserWindow | null = null
// Kept at module level: a garbage-collected Tray disappears from the top bar.
let tray: Tray | null = null
// Set once the controller exists: a dashboard that finishes loading afterwards gets its state.
let controller: ServiceController | null = null
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
  // Defensive: a push sent while the page is still loading can be dropped, and `publish()` skips
  // unchanged states, so every freshly loaded page is handed the current state (diagram 11).
  window.webContents.on('did-finish-load', () => {
    if (controller !== null) pushStateTo(() => window, controller.state())
  })

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

/** Shown until the controller exists, so a slow startup never leaves the app without a tray (#8). */
function createStartingTray(): Tray {
  const trayIcon = new Tray(nativeImage.createFromPath(TRAY_ICON_PATH))
  trayIcon.setToolTip('dock-n-roll')
  trayIcon.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Starting…', enabled: false },
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

function renderTray(trayIcon: Tray, controller: ServiceController, state: ControllerState): void {
  // On Linux the tray click is not guaranteed to be a left click (ADR-0001): every action is
  // in this menu, rebuilt on each state change.
  const entries = buildTrayMenu(state, {
    start: (id) => void controller.start(id),
    stop: (id) => void controller.stop(id),
    restart: (id) => void controller.restart(id),
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
async function start(trayIcon: Tray): Promise<void> {
  const socketPath = dockerSocketPath(process.env)
  const created = await createServiceController({
    socketPath,
    pinFilePath: join(app.getPath('appData'), 'dock-n-roll', 'services.yaml'),
    homeDir: app.getPath('home'),
    observeDocker,
    openPinFileStore,
    runCompose,
    resolveProjectName,
    filesExist,
    probeHealth,
    notify: showNotification,
    schedule: (run, delayMs) => {
      const timer = setTimeout(run, delayMs)
      return () => {
        clearTimeout(timer)
      }
    }
  })
  // "Quit" from the starting tray fired `before-quit` before this listener existed.
  if (isQuitting) {
    created.dispose()
    return
  }
  controller = created
  // Wired before any other await: the first full state arrives through `onChange` (diagram 11).
  created.onChange((state) => {
    if (trayIcon.isDestroyed()) return
    renderTray(trayIcon, created, state)
    pushStateTo(() => dashboard, state)
  })
  registerIpc(created, createBackgroundSource(() => created.containers(), scanListeningPorts), (event: IpcMainInvokeEvent) =>
    // A destroyed window's `webContents` throws on access: a call landing during quit is refused.
    isTrustedSender(event, dashboard !== null && !dashboard.isDestroyed() ? dashboard.webContents : null, DASHBOARD_ORIGIN)
  )
  // A dashboard opened during startup read no state (no IPC yet), and `publish()` skips an
  // unchanged state: hand it the current one now (diagram 11).
  pushStateTo(() => dashboard, created.state())
  if (app.isPackaged) {
    autostart = createAutostartToggle({
      initial: await isAutostartEnabled(AUTOSTART_ENTRY),
      write: (enabled) => setAutostart(AUTOSTART_ENTRY, enabled, process.execPath),
      onChange: () => {
        renderTray(trayIcon, created, created.state())
      },
      onError: (error) => {
        console.error('dock-n-roll: autostart update failed', error)
        dialog.showErrorBox('Could not change Start at login', error instanceof Error ? error.message : String(error))
      }
    })
  }
  if (!trayIcon.isDestroyed()) renderTray(trayIcon, created, created.state())
}

if (!app.requestSingleInstanceLock()) {
  // A second launch (autostart + manual start) must not add a second tray icon.
  app.quit()
} else {
  app.on('second-instance', showDashboard)
  // The single shutdown path, emitted before windows close whatever triggered the quit:
  // flag first (the dashboard really closes), then stop every input, then remove the icon.
  app.on('before-quit', () => {
    isQuitting = true
    controller?.dispose()
    controller = null
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
    tray = createStartingTray()
    start(tray).catch((error: unknown) => {
      // Without this the app would run with no tray and no window, and the single-instance
      // lock would block every relaunch.
      console.error('dock-n-roll: startup failed', error)
      dialog.showErrorBox('dock-n-roll could not start', error instanceof Error ? error.message : String(error))
      app.quit()
    })
  })
}
