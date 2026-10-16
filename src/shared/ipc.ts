// Contract between the main process and the preload / renderer (class diagram 07): types plus
// the `IPC` channel names. Main-process code is only reached through `import type`, so none of
// it ends up in the preload or renderer bundles.
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
  /** `false` while Docker cannot be reached (and before the first snapshot): every control is off (spec §4). */
  readonly dockerAvailable: boolean
  /** The observer's message while unavailable, `null` otherwise. */
  readonly dockerReason: string | null
  /** Pin-file problems, shown as a banner; the last valid pins stay in use. */
  readonly pinErrors: readonly string[]
  readonly services: readonly ServiceView[]
  /** The user's home folder, so the sandboxed renderer can show paths as `~/…`. */
  readonly homeDir: string
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

/**
 * What the preload script exposes on `window.dockNRoll`. Subscribe with `onStateChanged`
 * before calling `getState`, or a push in between is missed. `start` / `stop` / `restart` resolve once the
 * command ends, also when refused: the outcome is only in the next pushed state.
 */
export interface DockNRollApi {
  /** `null` when the main process refuses the caller (not the dashboard frame). */
  getState(): Promise<ControllerState | null>
  start(id: string): Promise<void>
  stop(id: string): Promise<void>
  restart(id: string): Promise<void>
  openUrl(id: string): Promise<void>
  /** `null` when the main process refuses the caller. */
  listBackground(): Promise<BackgroundView | null>
  /** Returns the unsubscribe function. */
  onStateChanged(callback: (state: ControllerState) => void): () => void
}

export const IPC = {
  getState: 'dock-n-roll:get-state',
  start: 'dock-n-roll:start',
  stop: 'dock-n-roll:stop',
  restart: 'dock-n-roll:restart',
  openUrl: 'dock-n-roll:open-url',
  listBackground: 'dock-n-roll:list-background',
  stateChanged: 'dock-n-roll:state-changed'
} as const
