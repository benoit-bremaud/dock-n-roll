import type { ContainerSnapshot, Controls, ServiceStatus, StatusInputs } from './types'

function isRunning(container: ContainerSnapshot): boolean {
  return container.state === 'running'
}

function isStopped(container: ContainerSnapshot): boolean {
  return container.state === 'exited' || container.state === 'created' || container.state === 'dead'
}

function isReady(container: ContainerSnapshot): boolean {
  return isRunning(container) && (container.health === null || container.health === 'healthy')
}

/** An init / migration job that exited 0 is done, not stopped, while the rest of the stack runs. */
function isDone(container: ContainerSnapshot, all: readonly ContainerSnapshot[]): boolean {
  return container.state === 'exited' && container.exitCode === 0 && all.some(isRunning)
}

/**
 * Status of one service, derived on every input change — never stored (spec §4).
 * Precedence: conflict > missing > stopping > starting > on > off > partial.
 */
export function deriveStatus(inputs: StatusInputs): ServiceStatus {
  const { containers } = inputs
  if (inputs.conflict) {
    return 'conflict'
  }
  if (!inputs.filesExist) {
    return 'missing'
  }
  if (inputs.pending === 'stop') {
    return 'stopping'
  }
  const allRunning = containers.length > 0 && containers.every(isRunning)
  if (
    inputs.pending === 'start' ||
    containers.some((container) => container.health === 'starting') ||
    (allRunning && inputs.healthGate === 'waiting')
  ) {
    return 'starting'
  }
  // `on` needs at least one container: "all ready" is vacuously true for an empty list.
  if (containers.length > 0 && containers.every((container) => isReady(container) || isDone(container, containers))) {
    return 'on'
  }
  if (containers.every(isStopped)) {
    return 'off'
  }
  return 'partial'
}

/** Which buttons the status allows (spec §4 Start / Stop columns). */
export function allowedControls(status: ServiceStatus, inputs: StatusInputs): Controls {
  const idle = inputs.pending === null
  switch (status) {
    case 'conflict':
    case 'stopping':
      return { start: false, stop: false }
    case 'missing':
      return { start: false, stop: idle && inputs.containers.some(isRunning) }
    case 'starting':
      return { start: false, stop: idle }
    case 'on':
      return { start: false, stop: idle }
    case 'off':
      return { start: idle, stop: false }
    case 'partial':
      return { start: idle, stop: idle }
  }
}
