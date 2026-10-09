// Pure domain types (class diagram 05-class-domain.md). No IO, no framework.

/** Docker `State.Status`. */
export type ContainerState =
  | 'created'
  | 'running'
  | 'paused'
  | 'restarting'
  | 'removing'
  | 'exited'
  | 'dead'

/** Docker `State.Health.Status`. */
export type Health = 'starting' | 'healthy' | 'unhealthy'

export interface PortBinding {
  readonly hostIp: string
  readonly hostPort: number
  readonly containerPort: number
  readonly protocol: string
}

export interface ContainerSnapshot {
  readonly id: string
  readonly name: string
  readonly image: string
  readonly state: ContainerState
  readonly exitCode: number | null
  /** `null` when the image has no HEALTHCHECK; only meaningful while running. */
  readonly health: Health | null
  readonly labels: Readonly<Record<string, string>>
  readonly publishedPorts: readonly PortBinding[]
}

export interface ComposeProjectRef {
  readonly name: string
  readonly workingDir: string
  readonly configFiles: readonly string[]
}

/** One validated entry of the pin file (spec §8); `workingDir` is normalized. */
export interface PinEntry {
  readonly workingDir: string
  /** Narrows the pin to one project of the dir; absent → applies to every project of that dir. */
  readonly project?: string
  readonly name?: string
  readonly url?: string
  readonly healthUrl?: string
  /** Pinned services come first, in pin-file order. */
  readonly pinned: boolean
  /** Hidden services are left out of the list. */
  readonly hidden: boolean
}

export interface PinFileResult {
  readonly entries: readonly PinEntry[]
  /** One human-readable message per rejected entry or field; never thrown. */
  readonly errors: readonly string[]
}

export interface Service {
  /**
   * `workingDir + "\0" + projectName`; `workingDir` alone only for a never-started pin with no
   * `project` key. Such an id changes when the first container appears: callers that track
   * pending operations key them by `workingDir` + project name, not by id.
   */
  readonly id: string
  readonly projectName: string | null
  readonly workingDir: string
  readonly configFiles: readonly string[]
  /** Relevant containers only (one-off containers excluded). */
  readonly containers: readonly ContainerSnapshot[]
  readonly pin: PinEntry | undefined
  readonly displayName: string
  /**
   * Other working dirs using the same project name — including a never-started pin that would
   * start under it; non-empty means `conflict` (ADR-0003).
   */
  readonly conflictingDirs: readonly string[]
}

export type PendingOperation = 'start' | 'stop'

/**
 * Spec §3: `none` = no `healthUrl` in the pin; `waiting` / `passed` = probe result. The gate is
 * ignored by `deriveStatus` when any container has its own HEALTHCHECK.
 */
export type HealthGate = 'none' | 'waiting' | 'passed'

export interface StatusInputs {
  readonly containers: readonly ContainerSnapshot[]
  readonly pending: PendingOperation | null
  /** Working dir and every config file exist — checked by the adapter (IO). */
  readonly filesExist: boolean
  /** Same as `Service.conflictingDirs.length > 0`. */
  readonly conflict: boolean
  readonly healthGate: HealthGate
}

export type ServiceStatus = 'conflict' | 'missing' | 'stopping' | 'starting' | 'on' | 'off' | 'partial'

export interface Controls {
  readonly start: boolean
  readonly stop: boolean
}

export interface ProcessRef {
  readonly name: string
  readonly pid: number
}

export interface ListeningSocket {
  readonly address: string
  readonly port: number
  /** Absent when `ss` cannot see the owner (root-owned socket, spec R3). */
  readonly process?: ProcessRef
}

export type PortOwner =
  | { readonly kind: 'process'; readonly name: string; readonly pid: number }
  | { readonly kind: 'container'; readonly name: string }
  | { readonly kind: 'unknown' }

export interface BackgroundPort {
  readonly address: string
  readonly port: number
  readonly owner: PortOwner
}
