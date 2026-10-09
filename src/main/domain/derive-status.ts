import type { ContainerSnapshot, Controls, ServiceStatus, StatusInputs } from './types'

function isRunning(container: ContainerSnapshot): boolean {
  return container.state === 'running'
}

function isStopped(container: ContainerSnapshot): boolean {
  return container.state === 'exited' || container.state === 'created' || container.state === 'dead'
}

/** Health only means something while running: a stopped container may keep a stale value. */
function isBooting(container: ContainerSnapshot): boolean {
  return isRunning(container) && container.health === 'starting'
}

function isReady(container: ContainerSnapshot): boolean {
  return isRunning(container) && (container.health === null || container.health === 'healthy')
}

/** An init / migration job that exited 0 is done, not stopped, while the rest of the stack runs. */
function isDone(container: ContainerSnapshot, all: readonly ContainerSnapshot[]): boolean {
  return container.state === 'exited' && container.exitCode === 0 && all.some(isRunning)
}

/** `up --wait` cannot succeed while a container is crash-looping or being removed. */
function isUnstartable(container: ContainerSnapshot): boolean {
  return container.state === 'restarting' || container.state === 'removing'
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
  const allUp = containers.length > 0 && containers.every((container) => isRunning(container) || isDone(container, containers))
  // Spec §3: the healthUrl gate only applies when no container has its own HEALTHCHECK.
  const gateApplies = containers.every((container) => container.health === null)
  if (
    inputs.pending === 'start' ||
    containers.some(isBooting) ||
    (allUp && gateApplies && inputs.healthGate === 'waiting')
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

/**
 * Which buttons the status allows (spec §4 Start / Stop columns). Any pending operation
 * disables both: stopping during a pending start would race `stop` with `up` (spec UC2).
 */
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
      return { start: idle && !inputs.containers.some(isUnstartable), stop: idle }
  }
}
