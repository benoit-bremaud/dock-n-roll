/// <reference types="vite/client" />
import type { DockNRollApi } from '../../shared/ipc'

declare global {
  /** Exposed on the window by the preload script (src/preload/index.ts). */
  var dockNRoll: DockNRollApi | undefined
}
