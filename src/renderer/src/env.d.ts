/// <reference types="vite/client" />
import type { DockNRollApi } from '../../shared/ipc'

declare global {
  /** Exposed on the window by the preload script (src/preload/index.ts). A global `var` cannot be readonly; nothing assigns it. */
  var dockNRoll: DockNRollApi | undefined
}
