import type { ComposeProjectRef, ContainerSnapshot } from './types'

const PROJECT = 'com.docker.compose.project'
const WORKING_DIR = 'com.docker.compose.project.working_dir'
const CONFIG_FILES = 'com.docker.compose.project.config_files'
const ONE_OFF = 'com.docker.compose.oneoff'

/** The Compose project a container belongs to, or `null` if it was not started by Compose. */
export function composeProjectOf(container: ContainerSnapshot): ComposeProjectRef | null {
  const name = container.labels[PROJECT]
  const workingDir = container.labels[WORKING_DIR]
  if (name === undefined || workingDir === undefined) {
    return null
  }
  const configFiles = (container.labels[CONFIG_FILES] ?? '')
    .split(',')
    .map((file) => file.trim())
    .filter((file) => file !== '')
  return { name, workingDir, configFiles }
}

/** One-off containers (`docker compose run`) never count towards a service status (spec §3). */
export function isRelevant(container: ContainerSnapshot): boolean {
  return container.labels[ONE_OFF] !== 'True'
}
