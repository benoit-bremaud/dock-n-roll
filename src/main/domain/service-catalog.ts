import { composeLabelsOf, isRelevant } from './compose-labels'
import { defaultProjectName, normalizeAbsolutePath } from './names'
import type { ContainerSnapshot, PinEntry, ResolvedNames, Service } from './types'

const ID_SEPARATOR = '\0'

interface DiscoveredProject {
  readonly name: string
  readonly workingDir: string
  readonly configFiles: string[]
  readonly containers: ContainerSnapshot[]
  /** First reason found among the project's containers; `null` when all labels are safe. */
  invalidReason: string | null
}

function basename(path: string): string {
  return path.split('/').filter((part) => part !== '').pop() ?? path
}

function discoverProjects(containers: readonly ContainerSnapshot[]): DiscoveredProject[] {
  const projects = new Map<string, DiscoveredProject>()
  for (const container of containers) {
    const labels = composeLabelsOf(container)
    if (labels.kind === 'none' || !isRelevant(container)) {
      continue
    }
    // Invalid containers join the project their raw labels name, so it shows as `invalid`.
    const name = labels.kind === 'valid' ? labels.ref.name : labels.rawProject
    const workingDir = labels.kind === 'valid' ? labels.ref.workingDir : (normalizeAbsolutePath(labels.rawWorkingDir) ?? labels.rawWorkingDir)
    const id = workingDir + ID_SEPARATOR + name
    const project = projects.get(id) ?? { name, workingDir, configFiles: [], containers: [], invalidReason: null }
    if (labels.kind === 'valid') {
      for (const file of labels.ref.configFiles) {
        if (!project.configFiles.includes(file)) {
          project.configFiles.push(file)
        }
      }
    } else {
      project.invalidReason ??= labels.reason
    }
    project.containers.push(container)
    projects.set(id, project)
  }
  return [...projects.values()]
}

/** A project-specific pin wins over a pin that covers the whole dir. */
function findPin(pins: readonly PinEntry[], workingDir: string, projectName: string): PinEntry | undefined {
  return (
    pins.find((pin) => pin.workingDir === workingDir && pin.project === projectName) ??
    pins.find((pin) => pin.workingDir === workingDir && pin.project === undefined)
  )
}

function byNameThenId(a: Service, b: Service): number {
  return a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id)
}

/**
 * Services shown to the developer: discovered Compose projects merged with the pin file,
 * conflicts flagged, hidden ones removed. Order: pinned services in pin-file order, then the
 * others by display name; ties broken by id so rows never swap between refreshes.
 */
export function buildServices(
  containers: readonly ContainerSnapshot[],
  pins: readonly PinEntry[],
  resolvedNames: ResolvedNames = new Map()
): Service[] {
  const projects = discoverProjects(containers)
  const neverStartedPins = pins.filter(
    (pin) =>
      !projects.some((project) => project.workingDir === pin.workingDir && (pin.project === undefined || pin.project === project.name))
  )

  // Only discovered, valid projects own containers that a command could act on: they define
  // which dirs use which project name.
  const dirsByName = new Map<string, string[]>()
  for (const project of projects.filter((candidate) => candidate.invalidReason === null)) {
    dirsByName.set(project.name, [...(dirsByName.get(project.name) ?? []), project.workingDir])
  }
  const otherDirs = (name: string | null, dir: string): string[] =>
    name === null ? [] : (dirsByName.get(name) ?? []).filter((other) => other !== dir)
  // A never-started pin would run `up` under its own project name, or the one Compose derives
  // from its dir: if that name is already used by another dir, `up` would take over its
  // containers. Only the pin is flagged — it must never block the running project's Stop.
  // The name comes from the pin, else from what Compose resolves (compose file `name:`, spec
  // §10 P1), else from the dir name Compose falls back to.
  const effectiveName = (pin: PinEntry): string | null =>
    pin.project ?? resolvedNames.get(pin.workingDir) ?? defaultProjectName(pin.workingDir)

  const discovered: Service[] = projects.map((project) => {
    const pin = findPin(pins, project.workingDir, project.name)
    return {
      id: project.workingDir + ID_SEPARATOR + project.name,
      // No project name to act on when the labels are unsafe: Stop / Start cannot be built.
      projectName: project.invalidReason === null ? project.name : null,
      workingDir: project.workingDir,
      configFiles: project.configFiles,
      containers: project.containers,
      pin,
      displayName: pin?.name ?? project.name,
      conflictingDirs: project.invalidReason === null ? otherDirs(project.name, project.workingDir) : [],
      invalidReason: project.invalidReason
    }
  })

  const neverStarted: Service[] = neverStartedPins.map((pin) => ({
    id: pin.project === undefined ? pin.workingDir : pin.workingDir + ID_SEPARATOR + pin.project,
    projectName: pin.project ?? null,
    workingDir: pin.workingDir,
    configFiles: [],
    containers: [],
    pin,
    displayName: pin.name ?? pin.project ?? basename(pin.workingDir),
    conflictingDirs: otherDirs(effectiveName(pin), pin.workingDir),
    invalidReason: null
  }))

  const pinRank = (service: Service): number => (service.pin === undefined ? -1 : pins.indexOf(service.pin))
  const visible = [...discovered, ...neverStarted].filter((service) => service.pin?.hidden !== true)
  const pinned = visible
    .filter((service) => service.pin?.pinned === true)
    .sort((a, b) => pinRank(a) - pinRank(b) || byNameThenId(a, b))
  const others = visible.filter((service) => service.pin?.pinned !== true).sort(byNameThenId)
  return [...pinned, ...others]
}
