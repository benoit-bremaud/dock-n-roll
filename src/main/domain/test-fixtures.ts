import type { ContainerSnapshot } from './types'

const COMPOSE = 'com.docker.compose'

/** Test builder: a running Compose container with sensible defaults. */
export function container(overrides: Partial<ContainerSnapshot> = {}): ContainerSnapshot {
  return {
    id: 'c1',
    name: 'app-web-1',
    image: 'app-web',
    state: 'running',
    exitCode: null,
    health: null,
    labels: {},
    publishedPorts: [],
    ...overrides
  }
}

/** Compose labels as written by `docker compose up`. */
export function composeLabels(
  project: string,
  workingDir: string,
  configFiles: string = `${workingDir}/compose.yaml`
): Record<string, string> {
  return {
    [`${COMPOSE}.project`]: project,
    [`${COMPOSE}.project.working_dir`]: workingDir,
    [`${COMPOSE}.project.config_files`]: configFiles
  }
}
