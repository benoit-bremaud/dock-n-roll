import type { BackgroundPort, ContainerSnapshot, ListeningSocket, PortBinding, PortOwner } from './types'

const ANY_ADDRESS = new Set(['', '0.0.0.0', '::', '[::]', '*'])

/** `[::1]` / `127.0.0.53%lo` → `::1` / `127.0.0.53`, so `ss` and Docker addresses compare. */
function bareAddress(address: string): string {
  const start = address.startsWith('[') ? 1 : 0
  const end = address.endsWith(']') ? address.length - 1 : address.length
  const unbracketed = address.slice(start, Math.max(start, end))
  const zone = unbracketed.indexOf('%')
  return zone === -1 ? unbracketed : unbracketed.slice(0, zone)
}

function isWildcard(address: string): boolean {
  return ANY_ADDRESS.has(address) || ANY_ADDRESS.has(bareAddress(address))
}

/** IPv4 and IPv6 wildcard sockets of one port are the same thing to the developer. */
function socketKey(socket: ListeningSocket): string {
  return isWildcard(socket.address) ? `*:${String(socket.port)}` : `${bareAddress(socket.address)}:${String(socket.port)}`
}

function publishes(binding: PortBinding, socket: ListeningSocket): boolean {
  return (
    binding.protocol === 'tcp' &&
    binding.hostPort === socket.port &&
    (isWildcard(binding.hostIp) || isWildcard(socket.address) || bareAddress(binding.hostIp) === bareAddress(socket.address))
  )
}

function ownerOf(socket: ListeningSocket, running: readonly ContainerSnapshot[]): PortOwner {
  if (socket.process !== undefined) {
    return { kind: 'process', name: socket.process.name, pid: socket.process.pid }
  }
  // Unprivileged `ss` cannot see docker-proxy (root): Docker's port bindings fill the gap (spec R3).
  const publisher = running.find((container) => container.publishedPorts.some((binding) => publishes(binding, socket)))
  return publisher === undefined ? { kind: 'unknown' } : { kind: 'container', name: publisher.name }
}

const OWNER_RANK: Readonly<Record<PortOwner['kind'], number>> = { process: 2, container: 1, unknown: 0 }

/**
 * Every listening port with its best-known owner, de-duplicated and sorted by port.
 * The caller passes TCP sockets only (UC4 lists TCP listeners).
 */
export function joinPorts(sockets: readonly ListeningSocket[], containers: readonly ContainerSnapshot[]): BackgroundPort[] {
  const running = containers.filter((container) => container.state === 'running')
  const byKey = new Map<string, BackgroundPort>()
  for (const socket of sockets) {
    const key = socketKey(socket)
    const candidate: BackgroundPort = { address: socket.address, port: socket.port, owner: ownerOf(socket, running) }
    const existing = byKey.get(key)
    if (existing === undefined) {
      byKey.set(key, candidate)
    } else if (OWNER_RANK[candidate.owner.kind] > OWNER_RANK[existing.owner.kind]) {
      // Keep the first address shown, but the best-known owner of the merged sockets.
      byKey.set(key, { ...existing, owner: candidate.owner })
    }
  }
  return [...byKey.values()].sort((a, b) => a.port - b.port)
}
