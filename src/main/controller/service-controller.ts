import type { ComposeResult, RunOptions } from '../adapters/compose-runner'
import type { DockerListener, DockerObserver, DockerObserverOptions } from '../adapters/docker-observer'
import type { ProbeOptions } from '../adapters/health-probe'
import type { PinFileStore } from '../adapters/pin-file-store'
import { buildStopArgs, buildUpArgs } from '../domain/compose-args'
import { allowedControls, deriveStatus } from '../domain/derive-status'
import { buildServices } from '../domain/service-catalog'
import type { ContainerSnapshot, HealthGate, PendingOperation, PinEntry, PinFileResult, Service, StatusInputs } from '../domain/types'
import type { ControllerState, ServiceView } from '../../shared/ipc'

// Application layer of class diagram 07: orchestrates domain and adapters, holds no rule of
// its own. Every input updates state and runs one serialized recomputation.

const HEALTH_POLL_MS = 2000
const HEALTH_TIMEOUT_MS = 1500
const MAX_REASON_CHARS = 500
/** A failed `docker compose config` (slow daemon at boot, file mid-edit) is retried after this. */
const NAME_RETRY_MS = 30_000

/** The adapters, injected so the controller is tested with in-memory stand-ins. */
export interface ControllerDeps {
  /** One value for the observer and the runner: the CLI acts on the daemon the app displays (ADR-0002). */
  readonly socketPath: string
  readonly pinFilePath: string
  /** Passed through to the state, for the dashboard's `~/…` paths. */
  readonly homeDir: string
  observeDocker(options: DockerObserverOptions, listener: DockerListener): DockerObserver
  openPinFileStore(path: string, onChange: (result: PinFileResult) => void): Promise<PinFileStore>
  runCompose(args: readonly string[], options: RunOptions): Promise<ComposeResult>
  resolveProjectName(workingDir: string, options: Omit<RunOptions, 'cwd'>): Promise<string | null>
  filesExist(workingDir: string, configFiles: readonly string[]): Promise<boolean>
  probeHealth(url: string, options: ProbeOptions): Promise<boolean>
  /** Clock for retrying failed name resolutions; overridable for tests. */
  readonly now?: () => number
  /** Schedules a health probe and returns its cancel function. */
  schedule(run: () => void, delayMs: number): () => void
}

export interface ServiceController {
  state(): ControllerState
  /**
   * Refused (no-op) when the id is unknown, Docker is unavailable, the dir is busy or the
   * derived status forbids it. Resolves once the command ends; a failure lands in the row's
   * `reason`, it never rejects.
   */
  start(id: string): Promise<void>
  /** Same contract as `start`. */
  stop(id: string): Promise<void>
  /** The pin's validated URL (spec R6), never a URL from the caller. */
  urlOf(id: string): string | null
  /** Current containers, for the background view (UC4). */
  containers(): readonly ContainerSnapshot[]
  /** Returns the unsubscribe function. */
  onChange(listener: (state: ControllerState) => void): () => void
  /** Stops observing, closes the pin file, cancels probes and drops listeners. Final. */
  dispose(): void
}

/**
 * A pending start or stop, keyed by working dir and the project name the command runs under —
 * not by `Service.id`, which changes when a never-started pin gets its first container. A row
 * with no project name yet (never-started pin) matches any pending entry of its dir. Other
 * projects of the same dir stay independent (`-p qa1` / `-p qa2`).
 */
interface Pending {
  readonly workingDir: string
  readonly projectName: string
  readonly operation: PendingOperation
}

function pendingFor(pending: readonly Pending[], service: Service): PendingOperation | null {
  const match = pending.find(
    (entry) => entry.workingDir === service.workingDir && (service.projectName === null || entry.projectName === service.projectName)
  )
  return match?.operation ?? null
}

function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

const NO_CONTROLS = { start: false, stop: false } as const

function excerpt(text: string): string {
  const trimmed = text.trim()
  return trimmed.length > MAX_REASON_CHARS ? `…${trimmed.slice(-MAX_REASON_CHARS)}` : trimmed
}

function allUp(containers: readonly ContainerSnapshot[]): boolean {
  return (
    containers.length > 0 &&
    containers.every((c) => c.state === 'running' || (c.state === 'exited' && c.exitCode === 0)) &&
    containers.some((c) => c.state === 'running')
  )
}

/**
 * Wires the adapters to the domain (class diagram 07). Resolves once the pin file is loaded,
 * before the first state is computed: until then `state()` lists no service, and the computed
 * state arrives through `onChange`. Rejects only if
 * `openPinFileStore` rejects. Later adapter failures are logged or shown on the rows, never thrown. Call `dispose()` on quit.
 */
export async function createServiceController(deps: ControllerDeps): Promise<ServiceController> {
  let containers: readonly ContainerSnapshot[] = []
  let dockerAvailable = false
  let dockerReason: string | null = null
  let pins: readonly PinEntry[] = []
  let pinErrors: readonly string[] = []
  /** Compose names of pin dirs, resolved once per dir (spec §10 P1). */
  const nameCache = new Map<string, string>()
  /** When each failed resolution was last tried, to retry it after `NAME_RETRY_MS`. */
  const failedAt = new Map<string, number>()
  const now = deps.now ?? Date.now
  let resolvedNames: ReadonlyMap<string, string> = new Map()
  let services: Service[] = []
  let pending: Pending[] = []
  const filesOk = new Map<string, boolean>()
  const gates = new Map<string, HealthGate>()
  const probing = new Map<string, () => void>()
  const lastError = new Map<string, string>()
  const listeners = new Set<(state: ControllerState) => void>()
  let current: ControllerState = { dockerAvailable, dockerReason, pinErrors, services: [], homeDir: deps.homeDir }
  let currentJson = JSON.stringify(current)
  let chain = Promise.resolve()
  let disposed = false
  /** Single flight: a resolution runs outside the chain, at most one at a time. */
  let resolving = false

  /** A never-started pin without `project` whose Compose name is unknown: `up` could take over another dir. */
  const unresolved = (service: Service): boolean =>
    service.containers.length === 0 && service.projectName === null && !resolvedNames.has(service.workingDir)

  const inputsOf = (service: Service): StatusInputs => {
    const gate: HealthGate = service.pin?.healthUrl === undefined ? 'none' : (gates.get(service.id) ?? 'waiting')
    return {
      containers: service.containers,
      pending: pendingFor(pending, service),
      filesExist: filesOk.get(service.id) ?? true,
      conflict: service.conflictingDirs.length > 0,
      invalid: service.invalidReason !== null,
      healthGate: gate
    }
  }

  const reasonOf = (service: Service, inputs: StatusInputs): string | null => {
    if (service.invalidReason !== null) return service.invalidReason
    if (inputs.conflict) return `project name also used by ${service.conflictingDirs.join(', ')}`
    if (!inputs.filesExist) return 'folder or compose file is missing'
    if (unresolved(service)) return 'Compose project name could not be resolved'
    return lastError.get(service.id) ?? null
  }

  const viewOf = (service: Service): ServiceView => {
    const inputs = inputsOf(service)
    const status = deriveStatus(inputs)
    const derived = allowedControls(status, inputs)
    // No command without the daemon it would act on, nor under a name that was not checked.
    const controls = !dockerAvailable ? NO_CONTROLS : unresolved(service) ? { start: false, stop: derived.stop } : derived
    return {
      id: service.id,
      displayName: service.displayName,
      workingDir: service.workingDir,
      status,
      controls,
      hasUrl: service.pin?.url !== undefined,
      reason: reasonOf(service, inputs)
    }
  }

  const cancelProbe = (id: string): void => {
    probing.get(id)?.()
    probing.delete(id)
  }

  const probeLater = (service: Service, url: string): void => {
    if (probing.has(service.id)) return
    const cancel = deps.schedule(() => {
      probing.delete(service.id)
      void deps.probeHealth(url, { timeoutMs: HEALTH_TIMEOUT_MS }).then((ok) => {
        if (ok) gates.set(service.id, 'passed')
        recompute()
      })
    }, HEALTH_POLL_MS)
    probing.set(service.id, cancel)
  }

  /** Spec §3: probe while all containers run or are done and the gate has not passed; reset when down. */
  const driveHealthGates = (): void => {
    for (const service of services) {
      const url = service.pin?.healthUrl
      if (url === undefined) continue
      const ownCheck = service.containers.some((c) => c.state === 'running' && c.health !== null)
      if (!allUp(service.containers)) {
        gates.delete(service.id)
        cancelProbe(service.id)
      } else if (!ownCheck && gates.get(service.id) !== 'passed') {
        probeLater(service, url)
      }
    }
  }

  /** Per-service state of services that no longer exist would leak, or resurface on an id change. */
  const prune = (): void => {
    const ids = new Set(services.map((service) => service.id))
    for (const map of [filesOk, gates, lastError]) {
      for (const id of map.keys()) if (!ids.has(id)) map.delete(id)
    }
    for (const id of [...probing.keys()]) if (!ids.has(id)) cancelProbe(id)
  }

  const publish = (): void => {
    const next: ControllerState = { dockerAvailable, dockerReason, pinErrors, services: services.map(viewOf), homeDir: deps.homeDir }
    const nextJson = JSON.stringify(next)
    // Each push rebuilds the tray menu over D-Bus: an unchanged state must not close it under the pointer.
    if (nextJson === currentJson) return
    current = next
    currentJson = nextJson
    for (const listener of listeners) {
      try {
        listener(current)
      } catch (error) {
        console.error('dock-n-roll: state listener failed', error)
      }
    }
  }

  const rebuild = async (): Promise<void> => {
    const next = buildServices(containers, pins, resolvedNames)
    const checks = await Promise.all(next.map((service) => deps.filesExist(service.workingDir, service.configFiles)))
    // `dispose()` may have run during the await: no publish, no new probe after it.
    if (disposed) return
    services = next
    services.forEach((service, index) => filesOk.set(service.id, checks[index] ?? true))
    prune()
    driveHealthGates()
    publish()
  }

  /** Serialized: a newer input waits for the running recomputation, so results publish in order (diagram 08). */
  const recompute = (before?: () => Promise<void>): void => {
    chain = chain
      .then(async () => {
        if (disposed) return
        await before?.()
        resolveNamesInBackground()
        await rebuild()
      })
      .catch((error: unknown) => {
        console.error('dock-n-roll: recomputation failed', error)
      })
  }

  /**
   * Resolves pin dirs not resolved yet — failures again after `NAME_RETRY_MS` — so a temporary
   * failure does not refuse Start until the app restarts. Runs **outside** the chain: a slow
   * `docker compose config` (up to 20 s) never holds a Docker snapshot or a pin change; the
   * rows stay unresolved (Start refused) until it ends, then one recomputation applies it.
   */
  const resolveNamesInBackground = (): void => {
    const dirs = [...new Set(pins.filter((entry) => entry.project === undefined).map((entry) => entry.workingDir))]
    for (const map of [nameCache, failedAt]) for (const dir of map.keys()) if (!dirs.includes(dir)) map.delete(dir)
    resolvedNames = new Map(nameCache)
    if (resolving) return
    const due = dirs.filter((dir) => !nameCache.has(dir) && now() - (failedAt.get(dir) ?? -Infinity) >= NAME_RETRY_MS)
    if (due.length === 0) return
    resolving = true
    void resolveNames(due)
      .catch((error: unknown) => {
        console.error('dock-n-roll: name resolution failed', error)
      })
      .finally(() => {
        resolving = false
        recompute()
      })
  }

  const resolveNames = async (due: readonly string[]): Promise<void> => {
    const names = await Promise.all(due.map((dir) => deps.resolveProjectName(dir, { socketPath: deps.socketPath })))
    due.forEach((dir, index) => {
      const name = names[index] ?? null
      if (name === null) {
        failedAt.set(dir, now())
      } else {
        nameCache.set(dir, name)
        failedAt.delete(dir)
      }
    })
  }

  const applyPins = (result: PinFileResult): void => {
    pins = result.entries
    pinErrors = result.errors
    recompute()
  }

  const run = async (id: string, operation: PendingOperation): Promise<void> => {
    await chain
    const found = services.find((candidate) => candidate.id === id)
    const view = current.services.find((candidate) => candidate.id === id)
    // Checked synchronously before the pending entry is added: two clicks in the same tick
    // resume one after the other, and the second sees the first one's entry.
    if (disposed || !dockerAvailable || found === undefined || view === undefined || !view.controls[operation]) return
    if (pendingFor(pending, found) !== null) return
    const name = found.projectName ?? resolvedNames.get(found.workingDir) ?? null
    const service: Service = { ...found, projectName: name }
    if (name === null) return
    const entry: Pending = { workingDir: service.workingDir, projectName: name, operation }
    pending = [...pending, entry]
    lastError.delete(service.id)
    recompute()
    let failure: string | null = null
    try {
      const args = operation === 'start' ? buildUpArgs(service) : buildStopArgs(service)
      const result = await deps.runCompose(args, { cwd: operation === 'start' ? service.workingDir : '/', socketPath: deps.socketPath })
      if (result.exitCode !== 0) failure = excerpt(result.stderr) || `docker compose exited with ${String(result.exitCode)}`
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error)
    } finally {
      pending = pending.filter((candidate) => candidate !== entry)
    }
    if (failure !== null) {
      // Keyed by the row the developer now sees: the id may have changed during the run.
      const row = services.find((candidate) => candidate.workingDir === service.workingDir && candidate.projectName === name)
      lastError.set(row?.id ?? service.id, failure)
    }
    recompute()
    await chain
  }

  const store = await deps.openPinFileStore(deps.pinFilePath, applyPins)
  const observer = deps.observeDocker(
    { socketPath: deps.socketPath },
    {
      onSnapshot: (snapshot) => {
        containers = snapshot
        dockerAvailable = true
        dockerReason = null
        recompute()
      },
      onUnavailable: (reason) => {
        dockerAvailable = false
        dockerReason = reason
        recompute()
      }
    }
  )
  // Not awaited: the caller gets the controller at once and the full state via `onChange`
  // (diagram 11); names resolve in the background and land through a later recomputation.
  applyPins(store.current())

  return {
    state: () => current,
    start: (id) => run(id, 'start'),
    stop: (id) => run(id, 'stop'),
    urlOf: (id) => {
      const url = services.find((service) => service.id === id)?.pin?.url ?? null
      // Validated by the pin file (spec R6) and checked again here, for every caller (tray and IPC).
      return url !== null && isHttpUrl(url) ? url : null
    },
    containers: () => containers,
    onChange: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      disposed = true
      observer.stop()
      store.close()
      for (const id of [...probing.keys()]) cancelProbe(id)
      listeners.clear()
    }
  }
}
