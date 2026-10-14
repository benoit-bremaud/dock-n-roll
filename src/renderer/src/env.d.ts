/// <reference types="vite/client" />
import type { DockNRollApi } from '../../shared/ipc'

declare global {
  interface Window {
    /** Exposed by the preload script (src/preload/index.ts). */
    readonly dockNRoll: DockNRollApi | undefined
  }
}
