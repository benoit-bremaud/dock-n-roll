// Contract between the main process and the renderer (class diagram 07). Types only: imported
// with `import type` from both sides, so no main-process code ever reaches the renderer bundle.
import type { BackgroundPort, Controls, ServiceStatus } from '../main/domain/types'

/** One dashboard / tray row. The renderer only ever sends `id` back. */
export interface ServiceView {
  readonly id: string
  readonly displayName: string
  readonly workingDir: string
  readonly status: ServiceStatus
  readonly controls: Controls
  /** The pin has a validated `url` (spec UC5); the URL itself never leaves the main process. */
  readonly hasUrl: boolean
  /** What the row must explain: invalid labels, conflict, missing folder or last failed command. */
  readonly reason: string | null
}

export interface ControllerState {
  /** `false` while Docker cannot be reached: rows are greyed without badge (spec §4). */
  readonly dockerAvailable: boolean
  readonly dockerReason: string | null
  /** Pin-file problems, shown as a banner; the last valid pins stay in use. */
  readonly pinErrors: readonly string[]
  readonly services: readonly ServiceView[]
}

/** UC4 container row. */
export interface ContainerRow {
  readonly name: string
  readonly image: string
  readonly state: string
  readonly health: string | null
  readonly project: string | null
}

export interface BackgroundView {
  readonly containers: readonly ContainerRow[]
  readonly ports: readonly BackgroundPort[]
}

/** What the preload script exposes on `window.dockNRoll`. */
export interface DockNRollApi {
  getState(): Promise<ControllerState>
  start(id: string): Promise<void>
  stop(id: string): Promise<void>
  openUrl(id: string): Promise<void>
  listBackground(): Promise<BackgroundView>
  /** Returns the unsubscribe function. */
  onStateChanged(callback: (state: ControllerState) => void): () => void
}

export const IPC = {
  getState: 'dock-n-roll:get-state',
  start: 'dock-n-roll:start',
  stop: 'dock-n-roll:stop',
  openUrl: 'dock-n-roll:open-url',
  listBackground: 'dock-n-roll:list-background',
  stateChanged: 'dock-n-roll:state-changed'
} as const
