import { isValidProjectName, normalizeAbsolutePath } from './names'
import type { ComposeProjectRef, ContainerSnapshot } from './types'

const PROJECT = 'com.docker.compose.project'
const WORKING_DIR = 'com.docker.compose.project.working_dir'
const CONFIG_FILES = 'com.docker.compose.project.config_files'
const ONE_OFF = 'com.docker.compose.oneoff'

/**
 * The Compose project a container belongs to, or `null` if it was not started by Compose or
 * its labels could not produce a safe command (spec R4: any container creator writes labels).
 */
export function composeProjectOf(container: ContainerSnapshot): ComposeProjectRef | null {
  const name = container.labels[PROJECT]
  const rawWorkingDir = container.labels[WORKING_DIR]
  if (name === undefined || rawWorkingDir === undefined || !isValidProjectName(name)) {
    return null
  }
  const workingDir = normalizeAbsolutePath(rawWorkingDir)
  const configFiles = (container.labels[CONFIG_FILES] ?? '')
    .split(',')
    .map((file) => file.trim())
    .filter((file) => file !== '')
    .map(normalizeAbsolutePath)
  if (workingDir === null || configFiles.includes(null)) {
    return null
  }
  return { name, workingDir, configFiles: configFiles.filter((file) => file !== null) }
}

/**
 * One-off containers (`docker compose run`) never count towards a service status (spec §3).
 * Compose writes the Python-style literal `True`.
 */
export function isRelevant(container: ContainerSnapshot): boolean {
  return container.labels[ONE_OFF] !== 'True'
}
