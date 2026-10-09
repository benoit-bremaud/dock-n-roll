import { composeProjectOf, isRelevant } from './compose-labels'
import type { ContainerSnapshot, PinEntry, Service } from './types'

const ID_SEPARATOR = '\0'

interface DiscoveredProject {
  readonly name: string
  readonly workingDir: string
  readonly configFiles: string[]
  readonly containers: ContainerSnapshot[]
}

function basename(path: string): string {
  return path.split('/').filter((part) => part !== '').pop() ?? path
}

function discoverProjects(containers: readonly ContainerSnapshot[]): DiscoveredProject[] {
  const projects = new Map<string, DiscoveredProject>()
  for (const container of containers) {
    const ref = composeProjectOf(container)
    if (ref === null || !isRelevant(container)) {
      continue
    }
    const id = ref.workingDir + ID_SEPARATOR + ref.name
    const project = projects.get(id) ?? { name: ref.name, workingDir: ref.workingDir, configFiles: [], containers: [] }
    for (const file of ref.configFiles) {
      if (!project.configFiles.includes(file)) {
        project.configFiles.push(file)
      }
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

/**
 * Services shown to the developer: discovered Compose projects merged with the pin file,
 * conflicts flagged, hidden ones removed, pinned first (ADR-0003, spec §3).
 */
export function buildServices(containers: readonly ContainerSnapshot[], pins: readonly PinEntry[]): Service[] {
  const projects = discoverProjects(containers)

  const dirsByName = new Map<string, string[]>()
  for (const project of projects) {
    dirsByName.set(project.name, [...(dirsByName.get(project.name) ?? []), project.workingDir])
  }

  const discovered: Service[] = projects.map((project) => {
    const pin = findPin(pins, project.workingDir, project.name)
    return {
      id: project.workingDir + ID_SEPARATOR + project.name,
      projectName: project.name,
      workingDir: project.workingDir,
      configFiles: project.configFiles,
      containers: project.containers,
      pin,
      displayName: pin?.name ?? project.name,
      conflictingDirs: (dirsByName.get(project.name) ?? []).filter((dir) => dir !== project.workingDir)
    }
  })

  const neverStarted: Service[] = pins
    .filter((pin) =>
      !projects.some(
        (project) => project.workingDir === pin.workingDir && (pin.project === undefined || pin.project === project.name)
      )
    )
    .map((pin) => ({
      id: pin.project === undefined ? pin.workingDir : pin.workingDir + ID_SEPARATOR + pin.project,
      projectName: pin.project ?? null,
      workingDir: pin.workingDir,
      configFiles: [],
      containers: [],
      pin,
      displayName: pin.name ?? pin.project ?? basename(pin.workingDir),
      conflictingDirs: []
    }))

  const pinRank = (service: Service): number => (service.pin === undefined ? -1 : pins.indexOf(service.pin))
  const visible = [...discovered, ...neverStarted].filter((service) => service.pin?.hidden !== true)
  const pinned = visible
    .filter((service) => service.pin?.pinned === true)
    .sort((a, b) => pinRank(a) - pinRank(b))
  const others = visible
    .filter((service) => service.pin?.pinned !== true)
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
  return [...pinned, ...others]
}
