import { isValidProjectName, normalizeAbsolutePath } from './names'
import type { ComposeLabels, ContainerSnapshot } from './types'

const PROJECT = 'com.docker.compose.project'
const WORKING_DIR = 'com.docker.compose.project.working_dir'
const CONFIG_FILES = 'com.docker.compose.project.config_files'
const ONE_OFF = 'com.docker.compose.oneoff'

/**
 * What a container's Compose labels say. Any container creator writes labels (spec R4): values
 * that could not produce a safe command make the container `invalid`, keeping its raw labels so
 * its project stays visible and flagged (spec §10 P2) rather than silently disappearing.
 */
export function composeLabelsOf(container: ContainerSnapshot): ComposeLabels {
  const rawProject = container.labels[PROJECT]
  if (rawProject === undefined) {
    return { kind: 'none' }
  }
  const rawWorkingDir = container.labels[WORKING_DIR]
  const invalid = (reason: string): ComposeLabels => ({ kind: 'invalid', rawProject, rawWorkingDir: rawWorkingDir ?? '', reason })
  if (rawWorkingDir === undefined) {
    return invalid('missing working dir label')
  }
  if (!isValidProjectName(rawProject)) {
    return invalid(`not a valid Compose project name: ${JSON.stringify(rawProject)}`)
  }
  const workingDir = normalizeAbsolutePath(rawWorkingDir)
  if (workingDir === null) {
    return invalid(`working dir is not an absolute path: ${JSON.stringify(rawWorkingDir)}`)
  }
  const configFiles: string[] = []
  for (const raw of (container.labels[CONFIG_FILES] ?? '').split(',')) {
    const file = raw.trim()
    if (file === '') continue
    const normalized = normalizeAbsolutePath(file)
    if (normalized === null) {
      return invalid(`config file is not an absolute path: ${JSON.stringify(file)}`)
    }
    configFiles.push(normalized)
  }
  return { kind: 'valid', ref: { name: rawProject, workingDir, configFiles } }
}

/**
 * One-off containers (`docker compose run`) never count towards a service status (spec §3).
 * Compose writes the Python-style literal `True`.
 */
export function isRelevant(container: ContainerSnapshot): boolean {
  return container.labels[ONE_OFF] !== 'True'
}
