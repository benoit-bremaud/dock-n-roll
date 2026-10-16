import type { ContainerSnapshot, ContainerState, Health, PortBinding } from '../domain/types'

// Pure translation of Docker Engine API responses (ADR-0005) into domain types. The daemon is
// trusted for structure but not assumed: anything unexpected becomes `null`, never a throw.

const STATES: readonly ContainerState[] = ['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead']
const HEALTHS: readonly Health[] = ['starting', 'healthy', 'unhealthy']

function isState(value: string): value is ContainerState {
  return (STATES as readonly string[]).includes(value)
}

function isHealth(value: string): value is Health {
  return (HEALTHS as readonly string[]).includes(value)
}
/** Container actions that can change a status; others (exec_*, attach, resize…) are noise. */
const STATUS_ACTIONS = new Set(['create', 'start', 'restart', 'die', 'stop', 'kill', 'pause', 'unpause', 'rename', 'update', 'health_status'])

type Json = Record<string, unknown>

function isJson(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function labelsOf(value: unknown): Record<string, string> {
  const labels: Record<string, string> = {}
  if (!isJson(value)) return labels
  for (const [key, label] of Object.entries(value)) {
    if (typeof label === 'string') labels[key] = label
  }
  return labels
}

/** `{"9000/tcp": [{HostIp, HostPort: "9000"}], "9092/tcp": null}` → published bindings only. */
function portsOf(value: unknown): PortBinding[] {
  if (!isJson(value)) return []
  const bindings: PortBinding[] = []
  for (const [key, hosts] of Object.entries(value)) {
    const [port, protocol] = key.split('/')
    const containerPort = Number(port)
    if (!Array.isArray(hosts) || !Number.isInteger(containerPort) || protocol === undefined) continue
    for (const host of hosts) {
      if (!isJson(host)) continue
      const hostPort = Number(host['HostPort'])
      if (Number.isInteger(hostPort) && hostPort > 0) {
        bindings.push({ hostIp: text(host['HostIp']) ?? '', hostPort, containerPort, protocol })
      }
    }
  }
  return bindings
}

/** `GET /containers/{id}/json` → snapshot; `null` when the response is not a container. */
export function toContainerSnapshot(response: unknown): ContainerSnapshot | null {
  if (!isJson(response) || !isJson(response['State']) || !isJson(response['Config'])) return null
  const id = text(response['Id'])
  const state = text(response['State']['Status'])
  if (id === null || state === null || !isState(state)) return null
  const stopped = state === 'exited' || state === 'dead'
  const exitCode = response['State']['ExitCode']
  const healthBlock = response['State']['Health']
  const health = isJson(healthBlock) ? text(healthBlock['Status']) : null
  return {
    id,
    name: (text(response['Name']) ?? id).replace(/^\//, ''),
    image: text(response['Config']['Image']) ?? '',
    state,
    // Docker reports 0 for a running container: an exit code only exists once it has stopped.
    exitCode: stopped && typeof exitCode === 'number' ? exitCode : null,
    oomKilled: response['State']['OOMKilled'] === true,
    health: health !== null && isHealth(health) ? health : null,
    labels: labelsOf(response['Config']['Labels']),
    publishedPorts: isJson(response['NetworkSettings']) ? portsOf(response['NetworkSettings']['Ports']) : []
  }
}

/** `GET /containers/json?all=1` → container ids, ignoring anything malformed. */
export function containerIds(response: unknown): string[] {
  if (!Array.isArray(response)) return []
  return response.flatMap((item: unknown) => {
    const id = isJson(item) ? text(item['Id']) : null
    return id === null ? [] : [id]
  })
}

export interface DockerEvent {
  readonly id: string
  /** `removed`: drop from the snapshot; `changed`: inspect again. */
  readonly kind: 'changed' | 'removed'
}

/** One line of `GET /events` → what to do, or `null` for events that cannot change a status. */
export function parseDockerEvent(line: string): DockerEvent | null {
  let event: unknown
  try {
    event = JSON.parse(line)
  } catch {
    return null
  }
  if (!isJson(event) || event['Type'] !== 'container' || !isJson(event['Actor'])) return null
  const id = text(event['Actor']['ID'])
  // Health events read `health_status: healthy`.
  const action = text(event['Action'])?.split(':')[0]
  if (id === null || action === undefined) return null
  if (action === 'destroy') return { id, kind: 'removed' }
  return STATUS_ACTIONS.has(action) ? { id, kind: 'changed' } : null
}
