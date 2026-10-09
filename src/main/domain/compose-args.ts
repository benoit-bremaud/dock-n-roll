import { isValidProjectName } from './names'
import type { Service } from './types'

/** Fixed in V1 (spec UC1): long enough for SonarQube's first start. */
const WAIT_TIMEOUT_SECONDS = 180

/** The service data cannot produce a safe command; the controller shows it as an error. */
export class InvalidServiceError extends Error {
  override readonly name = 'InvalidServiceError'
}

// Every argument uses the `--flag=value` form, so a value starting with `-` stays the value of
// its flag and can never be parsed as another flag. Values are re-checked here even though the
// label and pin-file readers already validate them: this is the last step before `execFile`.
function projectArgs(service: Service): string[] {
  if (service.projectName === null) {
    return []
  }
  if (!isValidProjectName(service.projectName)) {
    throw new InvalidServiceError(`not a valid Compose project name: ${JSON.stringify(service.projectName)}`)
  }
  return [`--project-name=${service.projectName}`]
}

function absolute(path: string, what: string): string {
  if (!path.startsWith('/') || path.includes('\0')) {
    throw new InvalidServiceError(`${what} is not an absolute path: ${JSON.stringify(path)}`)
  }
  return path
}

/**
 * `docker` arguments to start a service, for `execFile` — never joined into a shell string.
 * `--project-directory` pins relative paths and `.env` to the working dir the project was
 * created from. A never-started pin has no config files (and no project name unless its pin
 * sets `project`): Compose resolves them from the project directory.
 * @throws InvalidServiceError when the project name, working dir or a config file is unsafe (spec R4).
 */
export function buildUpArgs(service: Service): string[] {
  return [
    'compose',
    ...projectArgs(service),
    `--project-directory=${absolute(service.workingDir, 'working dir')}`,
    ...service.configFiles.map((file) => `--file=${absolute(file, 'config file')}`),
    'up',
    '-d',
    '--wait',
    `--wait-timeout=${String(WAIT_TIMEOUT_SECONDS)}`
  ]
}

/**
 * Stop by project label, without `--file`, so it works even when the folder is gone (spec UC2).
 * @throws InvalidServiceError when the service has no valid project name (nothing to stop by label).
 */
export function buildStopArgs(service: Service): string[] {
  if (service.projectName === null) {
    throw new InvalidServiceError('a service with no project name has no container to stop')
  }
  return ['compose', ...projectArgs(service), 'stop']
}
