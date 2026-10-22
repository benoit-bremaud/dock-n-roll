import { composeLabelsOf } from '../domain/compose-labels'
import { joinPorts } from '../domain/port-join'
import type { ComposeLabels, ContainerSnapshot, ListeningSocket } from '../domain/types'
import type { BackgroundView } from '../../shared/ipc'

/** The project a container claims, even through invalid labels; `null` outside Compose. */
function projectNameOf(labels: ComposeLabels): string | null {
  if (labels.kind === 'valid') return labels.ref.name
  if (labels.kind === 'invalid') return labels.rawProject
  return null
}

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
        // Docker keeps the last health of a stopped container: it says nothing any more (spec §3).
        health: container.state === 'running' ? container.health : null,
        project: projectNameOf(labels)
      }
    }),
    ports: joinPorts(sockets, containers)
  }
}

const CACHE_MS = 1000

/**
 * `listBackground` behind the IPC: each call would spawn `ss`, and the renderer is untrusted.
 * Concurrent calls share one scan, and a result is reused for a second.
 */
export function createBackgroundSource(
  containers: () => readonly ContainerSnapshot[],
  scanPorts: () => Promise<ListeningSocket[]>,
  now: () => number = Date.now
): () => Promise<BackgroundView> {
  let last: { at: number; view: Promise<BackgroundView> } | undefined
  return () => {
    if (last === undefined || now() - last.at >= CACHE_MS) {
      last = { at: now(), view: listBackground(containers(), scanPorts) }
    }
    return last.view
  }
}
