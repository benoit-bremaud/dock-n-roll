import { composeLabelsOf } from '../domain/compose-labels'
import { joinPorts } from '../domain/port-join'
import type { ContainerSnapshot, ListeningSocket } from '../domain/types'
import type { BackgroundView } from '../../shared/ipc'

/** UC4: every container plus every TCP listening port with its best-known owner. Never rejects. */
export async function listBackground(
  containers: readonly ContainerSnapshot[],
  scanPorts: () => Promise<ListeningSocket[]>
): Promise<BackgroundView> {
  let sockets: ListeningSocket[] = []
  try {
    sockets = await scanPorts()
  } catch (error) {
    // The container list is still useful without ports.
    console.error('dock-n-roll: port scan failed', error)
  }
  return {
    containers: containers.map((container) => {
      const labels = composeLabelsOf(container)
      return {
        name: container.name,
        image: container.image,
        state: container.state,
        health: container.health,
        project: labels.kind === 'valid' ? labels.ref.name : labels.kind === 'invalid' ? labels.rawProject : null
      }
    }),
    ports: joinPorts(sockets, containers)
  }
}
