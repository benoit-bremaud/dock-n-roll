import type { ComposeResult, RunOptions } from '../adapters/compose-runner'
import type { DockerListener, DockerObserver, DockerObserverOptions } from '../adapters/docker-observer'
import type { ProbeOptions } from '../adapters/health-probe'
import type { PinFileStore } from '../adapters/pin-file-store'
import { buildStopArgs, buildUpArgs } from '../domain/compose-args'
import { allowedControls, deriveStatus } from '../domain/derive-status'
import { crashedContainers, crashMessage } from '../domain/crash'
import { buildServices } from '../domain/service-catalog'
import type { ContainerSnapshot, Controls, HealthGate, MissingPath, PendingOperation, PinEntry, PinFileResult, Service, StatusInputs } from '../domain/types'
import type { ControllerState, ServiceView } from '../../shared/ipc'

// Application layer of class diagram 07: orchestrates domain and adapters, holds no rule of
// its own. Every input updates state and runs one serialized recomputation.

const HEALTH_POLL_MS = 2000
const HEALTH_TIMEOUT_MS = 1500
const MAX_REASON_CHARS = 500
/** A failed `docker compose config` (slow daemon at boot, file mid-edit) is retried after this. */
const NAME_RETRY_MS = 30_000
/** At most one crash notification per service in this window, so a crash loop does not flood. */
const NOTIFY_WINDOW_MS = 60_000
/** After a Stop ends, its containers' late `die` snapshots are not crashes (apps exiting 1 on SIGTERM). */
const STOP_QUIET_MS = 10_000

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
  findMissingPath(workingDir: string, configFiles: readonly string[]): Promise<MissingPath | null>
  probeHealth(url: string, options: ProbeOptions): Promise<boolean>
  /** Shows a desktop notification; both texts are plain (the adapter escapes them). */
  notify(title: string, body: string): void
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
  /** UC6, same contract as `start`: a stop then an `up` under one pending entry; a failed stop skips the `up` (diagram 12). */
  restart(id: string): Promise<void>
  /** The pin's validated URL (spec R6), never a URL from the caller. */
  urlOf(id: string): string | null
  /** Current containers, for the background view (UC4). */
  containers(): readonly ContainerSnapshot[]
  /** Containers of one listed service, for its logs (UC7); `null` for an unknown id. */
  containersOf(id: string): readonly ContainerSnapshot[] | null
  /** Returns the unsubscribe function. */
  onChange(listener: (state: ControllerState) => void): () => void
  /** Stops observing, closes the pin file, cancels probes and drops listeners. Final. */
  dispose(): void
}

/**
 * A pending start or stop (a restart is one entry whose operation goes from stop to start), keyed by working dir and the project name the command runs under —
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

const NO_CONTROLS = { start: false, stop: false, restart: false } as const

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
  /** `null` when every file is there; no entry before the first check. */
  const missingPaths = new Map<string, MissingPath | null>()
  const gates = new Map<string, HealthGate>()
  const probing = new Map<string, () => void>()
  const lastError = new Map<string, string>()
  const notifiedAt = new Map<string, number>()
  const stoppedAt = new Map<string, number>()
  const listeners = new Set<(state: ControllerState) => void>()
  let current: ControllerState = { dockerAvailable, dockerReason, pinErrors, services: [], homeDir: deps.homeDir }
  let currentJson = JSON.stringify(current)
  let chain = Promise.resolve()
  let disposed = false
  const isDisposed = (): boolean => disposed
  /** Single flight: a resolution runs outside the chain, at most one at a time. */
  let resolving = false
  let cancelNameRetry: () => void = () => undefined

  /** A never-started pin without `project` whose Compose name is unknown: `up` could take over another dir. */
  const unresolved = (service: Service): boolean =>
    service.containers.length === 0 && service.projectName === null && !resolvedNames.has(service.workingDir)

  const inputsOf = (service: Service): StatusInputs => {
    const gate: HealthGate = service.pin?.healthUrl === undefined ? 'none' : (gates.get(service.id) ?? 'waiting')
    return {
      containers: service.containers,
      pending: pendingFor(pending, service),
      filesExist: (missingPaths.get(service.id) ?? null) === null,
      conflict: service.conflictingDirs.length > 0,
      invalid: service.invalidReason !== null,
      healthGate: gate
    }
  }

  const reasonOf = (service: Service, inputs: StatusInputs): string | null => {
    if (service.invalidReason !== null) return service.invalidReason
    if (inputs.conflict) return `project name also used by ${service.conflictingDirs.join(', ')}`
    const missing = missingPaths.get(service.id)
    if (missing) return `${missing.kind} ${missing.path} is missing`
    if (unresolved(service)) return 'Compose project name could not be resolved'
    return lastError.get(service.id) ?? null
  }

  const viewOf = (service: Service): ServiceView => {
    const inputs = inputsOf(service)
    const status = deriveStatus(inputs)
    const derived = allowedControls(status, inputs)
    // No command without the daemon it would act on, nor under a name that was not checked.
    let controls: Controls = derived
    if (!dockerAvailable) controls = NO_CONTROLS
    else if (unresolved(service)) controls = { ...derived, start: false }
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
    for (const map of [missingPaths, gates, lastError, notifiedAt, stoppedAt]) {
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
    const checks = await Promise.all(next.map((service) => deps.findMissingPath(service.workingDir, service.configFiles)))
    // `dispose()` may have run during the await: no publish, no new probe after it.
    if (disposed) return
    services = next
    services.forEach((service, index) => missingPaths.set(service.id, checks[index] ?? null))
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
        const dirs = unpinnedNameDirs()
        pruneNames(dirs)
        resolveNamesInBackground(dirs)
        await rebuild()
      })
      .catch((error: unknown) => {
        console.error('dock-n-roll: recomputation failed', error)
      })
  }

  /** Pin dirs without `project`, whose Compose name must be resolved. */
  const unpinnedNameDirs = (): string[] => [
    ...new Set(pins.filter((entry) => entry.project === undefined).map((entry) => entry.workingDir))
  ]

  /** Names of removed pins are dropped; the rows read the cache as it is now. */
  const pruneNames = (dirs: readonly string[]): void => {
    for (const map of [nameCache, failedAt]) for (const dir of map.keys()) if (!dirs.includes(dir)) map.delete(dir)
    resolvedNames = new Map(nameCache)
  }

  /**
   * Resolves pin dirs not resolved yet — failures again after `NAME_RETRY_MS`, on a timer, so a
   * temporary failure does not refuse Start until the next input. Runs **outside** the chain and
   * one batch at a time: a slow `docker compose config` (up to 20 s) never holds a Docker
   * snapshot or a pin change; the rows stay unresolved (Start refused) until it ends, then one
   * recomputation applies it.
   */
  const resolveNamesInBackground = (dirs: readonly string[]): void => {
    if (resolving) return
    const due = dirs.filter((dir) => !nameCache.has(dir) && now() - (failedAt.get(dir) ?? -Infinity) >= NAME_RETRY_MS)
    if (due.length === 0) return
    resolving = true
    void resolveNames(due).then((anyFailed) => {
      resolving = false
      if (disposed) return
      if (anyFailed) {
        cancelNameRetry()
        cancelNameRetry = deps.schedule(() => {
          recompute()
        }, NAME_RETRY_MS)
      }
      recompute()
    })
  }

  /** Never rejects: a throwing resolution counts as a failure of its own dir only. */
  const resolveNames = async (due: readonly string[]): Promise<boolean> => {
    const names = await Promise.all(
      due.map((dir) => deps.resolveProjectName(dir, { socketPath: deps.socketPath }).catch((error: unknown) => {
        console.error('dock-n-roll: name resolution failed', error)
        return null
      }))
    )
    due.forEach((dir, index) => {
      const name = names[index] ?? null
      if (name === null) {
        failedAt.set(dir, now())
      } else {
        nameCache.set(dir, name)
        failedAt.delete(dir)
      }
    })
    return names.some((name) => name === null)
  }

  const applyPins = (result: PinFileResult): void => {
    pins = result.entries
    pinErrors = result.errors
    recompute()
  }

  /** Runs one command; returns the failure message, or `null` on success. */
  const runOne = async (service: Service, operation: PendingOperation): Promise<string | null> => {
    try {
      const args = operation === 'start' ? buildUpArgs(service) : buildStopArgs(service)
      const result = await deps.runCompose(args, { cwd: operation === 'start' ? service.workingDir : '/', socketPath: deps.socketPath })
      return result.exitCode === 0 ? null : excerpt(result.stderr) || `docker compose exited with ${String(result.exitCode)}`
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  /** Read through a call: both inputs can change during an await, which narrowing cannot see. */
  const canUp = (service: Service): boolean => !isDisposed() && dockerAvailable && (missingPaths.get(service.id) ?? null) === null

  /** The service a request may act on, under the name its command runs with; `null` when refused. */
  const claim = (id: string, request: keyof Controls): { service: Service; name: string } | null => {
    const found = services.find((candidate) => candidate.id === id)
    const view = current.services.find((candidate) => candidate.id === id)
    if (disposed || !dockerAvailable || found === undefined || view?.controls[request] !== true) return null
    if (pendingFor(pending, found) !== null) return null
    const name = found.projectName ?? resolvedNames.get(found.workingDir) ?? null
    return name === null ? null : { service: { ...found, projectName: name }, name }
  }

  const run = async (id: string, request: keyof Controls): Promise<void> => {
    await chain
    // Claimed synchronously before the pending entry is added: two clicks in the same tick
    // resume one after the other, and the second sees the first one's entry.
    const claimed = claim(id, request)
    if (claimed === null) return
    const { service, name } = claimed
    // A restart is a stop then an `up` (diagram 12): the entry is swapped in place between the
    // two, so nothing else can run on the service in between.
    const steps: readonly PendingOperation[] = request === 'restart' ? ['stop', 'start'] : [request]
    let entry: Pending | null = null
    lastError.delete(service.id)
    let failure: string | null = null
    for (const operation of steps) {
      const previous = entry
      if (previous !== null) {
        // Second step of a restart. Like a plain Start, no `up` without the daemon or the files:
        // the row then shows that reason. Docker may also never have shown the stack down, so
        // the `up` is re-gated.
        recompute()
        await chain
        if (!canUp(service)) break
        gates.delete(service.id)
        cancelProbe(service.id)
      }
      const next: Pending = { workingDir: service.workingDir, projectName: name, operation }
      pending = previous === null ? [...pending, next] : pending.map((candidate) => (candidate === previous ? next : candidate))
      entry = next
      recompute()
      failure = await runOne(service, operation)
      if (failure !== null) break
    }
    pending = pending.filter((candidate) => candidate !== entry)
    // Last step run was a stop: a plain Stop, or a restart that skipped its `up`.
    if (entry?.operation === 'stop') stoppedAt.set(service.id, now())
    if (failure !== null) {
      // Keyed by the row the developer now sees: the id may have changed during the run.
      const row = services.find((candidate) => candidate.workingDir === service.workingDir && candidate.projectName === name)
      lastError.set(row?.id ?? service.id, failure)
    }
    recompute()
    await chain
  }

  /**
   * Diagram 13: compares with the previous snapshot of the same connection only — after an
   * outage the gap is unknown, not a crash. The rows are built here from the previous
   * snapshot, the one the crashed containers ran in: `services` may lag behind it (rebuilt in
   * the chain).
   */
  const notifyCrashes = (next: readonly ContainerSnapshot[]): void => {
    if (disposed || !dockerAvailable) return
    const crashes = crashedContainers(containers, next)
    if (crashes.length === 0) return
    const rows = buildServices(containers, pins, resolvedNames)
    const within = (map: ReadonlyMap<string, number>, id: string, windowMs: number): boolean => now() - (map.get(id) ?? -Infinity) < windowMs
    for (const crashed of crashes) {
      const service = rows.find((candidate) => candidate.containers.some((c) => c.id === crashed.id))
      if (service === undefined || pendingFor(pending, service) !== null) continue
      if (within(stoppedAt, service.id, STOP_QUIET_MS) || within(notifiedAt, service.id, NOTIFY_WINDOW_MS)) continue
      notifiedAt.set(service.id, now())
      try {
        deps.notify(service.displayName, crashMessage(crashed))
      } catch (error) {
        console.error('dock-n-roll: notification failed', error)
      }
    }
  }

  const store = await deps.openPinFileStore(deps.pinFilePath, applyPins)
  const observer = deps.observeDocker(
    { socketPath: deps.socketPath },
    {
      onSnapshot: (snapshot) => {
        notifyCrashes(snapshot)
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
    restart: (id) => run(id, 'restart'),
    urlOf: (id) => {
      const url = services.find((service) => service.id === id)?.pin?.url ?? null
      // Validated by the pin file (spec R6) and checked again here, for every caller (tray and IPC).
      return url !== null && isHttpUrl(url) ? url : null
    },
    containers: () => containers,
    containersOf: (id) => services.find((service) => service.id === id)?.containers ?? null,
    onChange: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      disposed = true
      cancelNameRetry()
      observer.stop()
      store.close()
      for (const id of [...probing.keys()]) cancelProbe(id)
      listeners.clear()
    }
  }
}
