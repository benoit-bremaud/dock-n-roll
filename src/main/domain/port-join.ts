import type { BackgroundPort, ContainerSnapshot, ListeningSocket, PortOwner } from './types'

const ANY_ADDRESS = new Set(['0.0.0.0', '::', '[::]', '*'])

/** IPv4 and IPv6 wildcard sockets of one port are the same thing to the developer. */
function socketKey(socket: ListeningSocket): string {
  return ANY_ADDRESS.has(socket.address) ? `*:${String(socket.port)}` : `${socket.address}:${String(socket.port)}`
}

function ownerOf(socket: ListeningSocket, running: readonly ContainerSnapshot[]): PortOwner {
  if (socket.process !== undefined) {
    return { kind: 'process', name: socket.process.name, pid: socket.process.pid }
  }
  // Unprivileged `ss` cannot see docker-proxy (root): Docker's port bindings fill the gap (spec R3).
  const publisher = running.find((container) => container.publishedPorts.some((binding) => binding.hostPort === socket.port))
  return publisher === undefined ? { kind: 'unknown' } : { kind: 'container', name: publisher.name }
}

/** Every TCP listening port with its best-known owner, de-duplicated and sorted by port. */
export function joinPorts(sockets: readonly ListeningSocket[], containers: readonly ContainerSnapshot[]): BackgroundPort[] {
  const running = containers.filter((container) => container.state === 'running')
  const byKey = new Map<string, BackgroundPort>()
  for (const socket of sockets) {
    const key = socketKey(socket)
    if (!byKey.has(key)) {
      byKey.set(key, { address: socket.address, port: socket.port, owner: ownerOf(socket, running) })
    }
  }
  return [...byKey.values()].sort((a, b) => a.port - b.port)
}
