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

/** Docker `State.Health.Status`; `null` when the image has no HEALTHCHECK. */
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
  readonly health: Health | null
  readonly labels: Readonly<Record<string, string>>
  readonly publishedPorts: readonly PortBinding[]
}

export interface ComposeProjectRef {
  readonly name: string
  readonly workingDir: string
  readonly configFiles: readonly string[]
}

export interface PinEntry {
  readonly workingDir: string
  readonly project?: string
  readonly name?: string
  readonly url?: string
  readonly healthUrl?: string
  readonly pinned: boolean
  readonly hidden: boolean
}

export interface PinFileResult {
  readonly entries: readonly PinEntry[]
  /** One human-readable message per rejected entry or field; never thrown. */
  readonly errors: readonly string[]
}

export interface Service {
  /** `workingDir + "\0" + projectName`, or `workingDir` alone for a pin with no container yet. */
  readonly id: string
  readonly projectName: string | null
  readonly workingDir: string
  readonly configFiles: readonly string[]
  /** Relevant containers only (one-off containers excluded). */
  readonly containers: readonly ContainerSnapshot[]
  readonly pin: PinEntry | undefined
  readonly displayName: string
  /** Other working dirs using the same project name; non-empty means `conflict` (ADR-0003). */
  readonly conflictingDirs: readonly string[]
}

export type PendingOperation = 'start' | 'stop'

/** Spec §3: `healthUrl` gates readiness only when no relevant container has a HEALTHCHECK. */
export type HealthGate = 'none' | 'waiting' | 'passed'

export interface StatusInputs {
  readonly containers: readonly ContainerSnapshot[]
  readonly pending: PendingOperation | null
  /** Working dir and every config file exist — checked by the adapter (IO). */
  readonly filesExist: boolean
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
