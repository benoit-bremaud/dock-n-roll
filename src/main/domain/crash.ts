import type { ContainerSnapshot } from './types'

/**
 * Exit codes of an intentional stop: `docker stop` (SIGTERM 143, SIGKILL 137 after the
 * timeout) and Ctrl-C (130). Notifying them would alert on every stop run from a terminal
 * (owner MCDA A); an out-of-memory kill is still reported through `oomKilled`.
 */
const SIGNAL_EXITS: ReadonlySet<number> = new Set([0, 130, 137, 143])

function hasCrashed(container: ContainerSnapshot): boolean {
  if (container.state === 'restarting') return true
  if (container.state !== 'exited' && container.state !== 'dead') return false
  return container.oomKilled || container.state === 'dead' || (container.exitCode !== null && !SIGNAL_EXITS.has(container.exitCode))
}

/** Containers running in `before` that crashed in `after` (spec UC3 extension 3b, diagram 13). */
export function crashedContainers(before: readonly ContainerSnapshot[], after: readonly ContainerSnapshot[]): ContainerSnapshot[] {
  const wasRunning = new Set(before.filter((container) => container.state === 'running').map((container) => container.id))
  return after.filter((container) => wasRunning.has(container.id) && hasCrashed(container))
}

/** Plain text for the notification body. */
export function crashMessage(container: ContainerSnapshot): string {
  if (container.oomKilled) return `${container.name} was killed: out of memory`
  if (container.state === 'restarting') return `${container.name} crashed and is restarting`
  if (container.state === 'dead') return `${container.name} died`
  if (container.exitCode === null) return `${container.name} exited`
  return `${container.name} exited with code ${String(container.exitCode)}`
}
