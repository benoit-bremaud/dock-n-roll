import type { ComposeResult, RunOptions } from '../adapters/compose-runner'
import type { DockerListener, DockerObserver, DockerObserverOptions } from '../adapters/docker-observer'
import type { ProbeOptions } from '../adapters/health-probe'
import type { PinFileStore } from '../adapters/pin-file-store'
import { buildStopArgs, buildUpArgs, InvalidServiceError } from '../domain/compose-args'
import { allowedControls, deriveStatus } from '../domain/derive-status'
import { buildServices } from '../domain/service-catalog'
import type { ContainerSnapshot, HealthGate, PendingOperation, PinEntry, PinFileResult, Service, StatusInputs } from '../domain/types'
import type { ControllerState, ServiceView } from '../../shared/ipc'

// Application layer of class diagram 07: orchestrates domain and adapters, holds no rule of
// its own. Every input updates state and runs one serialized recomputation.

const HEALTH_POLL_MS = 2000
const HEALTH_TIMEOUT_MS = 1500
const MAX_REASON_CHARS = 500

/** The adapters, injected so the controller is tested with in-memory stand-ins. */
export interface ControllerDeps {
  /** One value for the observer and the runner: the CLI acts on the daemon the app displays (ADR-0002). */
  readonly socketPath: string
  readonly pinFilePath: string
  observeDocker(options: DockerObserverOptions, listener: DockerListener): DockerObserver
  openPinFileStore(path: string, onChange: (result: PinFileResult) => void): Promise<PinFileStore>
  runCompose(args: readonly string[], options: RunOptions): Promise<ComposeResult>
  resolveProjectName(workingDir: string, options: Omit<RunOptions, 'cwd'>): Promise<string | null>
  filesExist(workingDir: string, configFiles: readonly string[]): Promise<boolean>
  probeHealth(url: string, options: ProbeOptions): Promise<boolean>
  /** Schedules a health probe and returns its cancel function. */
  schedule(run: () => void, delayMs: number): () => void
}

export interface ServiceController {
  state(): ControllerState
  /** Refused (no-op) when the id is unknown or the derived status forbids it. */
  start(id: string): Promise<void>
  stop(id: string): Promise<void>
  /** The pin's validated URL (spec R6), never a URL from the caller. */
  urlOf(id: string): string | null
  /** Current containers, for the background view (UC4). */
  containers(): readonly ContainerSnapshot[]
  /** Returns the unsubscribe function. */
  onChange(listener: (state: ControllerState) => void): () => void
  dispose(): void
}

/**
 * A pending start or stop. `projectName` is null for a never-started pin without `project`:
 * it then covers every project of that dir, because the project name (and so `Service.id`)
 * only appears with the first container, while `up --wait` is still running.
 */
interface Pending {
  readonly workingDir: string
  readonly projectName: string | null
  readonly operation: PendingOperation
}

function pendingFor(pending: readonly Pending[], service: Service): PendingOperation | null {
  const match = pending.find(
    (entry) => entry.workingDir === service.workingDir && (entry.projectName === null || entry.projectName === service.projectName)
  )
  return match?.operation ?? null
}

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

export async function createServiceController(deps: ControllerDeps): Promise<ServiceController> {
  let containers: readonly ContainerSnapshot[] = []
  let dockerAvailable = false
  let dockerReason: string | null = null
  let pins: readonly PinEntry[] = []
  let pinErrors: readonly string[] = []
  let resolvedNames: ReadonlyMap<string, string> = new Map()
  let services: Service[] = []
  let pending: Pending[] = []
  const filesOk = new Map<string, boolean>()
  const gates = new Map<string, HealthGate>()
  const probing = new Map<string, () => void>()
  const lastError = new Map<string, string>()
  const listeners = new Set<(state: ControllerState) => void>()
  let current: ControllerState = { dockerAvailable, dockerReason, pinErrors, services: [] }
  let chain = Promise.resolve()
  let disposed = false

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
    return lastError.get(service.id) ?? null
  }

  const viewOf = (service: Service): ServiceView => {
    const inputs = inputsOf(service)
    const status = deriveStatus(inputs)
    return {
      id: service.id,
      displayName: service.displayName,
      workingDir: service.workingDir,
      status,
      controls: allowedControls(status, inputs),
      hasUrl: service.pin?.url !== undefined,
      reason: reasonOf(service, inputs)
    }
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
        probing.get(service.id)?.()
        probing.delete(service.id)
      } else if (!ownCheck && gates.get(service.id) !== 'passed') {
        probeLater(service, url)
      }
    }
  }

  const publish = (): void => {
    current = { dockerAvailable, dockerReason, pinErrors, services: services.map(viewOf) }
    for (const listener of listeners) {
      try {
        listener(current)
      } catch (error) {
        console.error('dock-n-roll: state listener failed', error)
      }
    }
  }

  const rebuild = async (): Promise<void> => {
    services = buildServices(containers, pins, resolvedNames)
    const checks = await Promise.all(services.map((service) => deps.filesExist(service.workingDir, service.configFiles)))
    services.forEach((service, index) => filesOk.set(service.id, checks[index] ?? true))
    driveHealthGates()
    publish()
  }

  /** Serialized: a newer input waits for the running recomputation (diagram 08). */
  const recompute = (before?: () => Promise<void>): void => {
    chain = chain
      .then(async () => {
        if (disposed) return
        await before?.()
        await rebuild()
      })
      .catch((error: unknown) => {
        console.error('dock-n-roll: recomputation failed', error)
      })
  }

  const resolveNames = async (): Promise<void> => {
    const unnamed = pins.filter((entry) => entry.project === undefined)
    const names = await Promise.all(unnamed.map((entry) => deps.resolveProjectName(entry.workingDir, { socketPath: deps.socketPath })))
    const next = new Map<string, string>()
    unnamed.forEach((entry, index) => {
      const name = names[index]
      if (name !== null && name !== undefined) next.set(entry.workingDir, name)
    })
    resolvedNames = next
  }

  const applyPins = (result: PinFileResult): void => {
    pins = result.entries
    pinErrors = result.errors
    recompute(resolveNames)
  }

  const run = async (id: string, operation: PendingOperation): Promise<void> => {
    await chain
    const service = services.find((candidate) => candidate.id === id)
    const view = current.services.find((candidate) => candidate.id === id)
    if (service === undefined || view === undefined || !view.controls[operation]) return
    let args: string[]
    try {
      args = operation === 'start' ? buildUpArgs(service) : buildStopArgs(service)
    } catch (error) {
      if (!(error instanceof InvalidServiceError)) throw error
      lastError.set(service.id, error.message)
      recompute()
      return
    }
    const entry: Pending = { workingDir: service.workingDir, projectName: service.projectName, operation }
    pending = [...pending, entry]
    lastError.delete(service.id)
    recompute()
    const result = await deps.runCompose(args, { cwd: operation === 'start' ? service.workingDir : '/', socketPath: deps.socketPath })
    pending = pending.filter((candidate) => candidate !== entry)
    if (result.exitCode !== 0) {
      // Keyed by the id at the time of the result: the row the developer is looking at.
      const now = services.find((candidate) => candidate.workingDir === service.workingDir && (service.projectName === null || candidate.projectName === service.projectName))
      lastError.set(now?.id ?? service.id, excerpt(result.stderr) || `docker compose exited with ${String(result.exitCode)}`)
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
  applyPins(store.current())
  await chain

  return {
    state: () => current,
    start: (id) => run(id, 'start'),
    stop: (id) => run(id, 'stop'),
    urlOf: (id) => services.find((service) => service.id === id)?.pin?.url ?? null,
    containers: () => containers,
    onChange: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      disposed = true
      observer.stop()
      store.close()
      for (const cancel of probing.values()) cancel()
      listeners.clear()
    }
  }
}
