import type { Service } from './types'

/** Fixed in V1 (spec UC1): long enough for SonarQube's first start. */
const WAIT_TIMEOUT_SECONDS = '180'

/** The service data cannot produce a safe command; the controller shows it as an error. */
export class InvalidServiceError extends Error {
  override readonly name = 'InvalidServiceError'
}

// Arguments always use the `--flag=value` form so that a label value starting with `-`
// stays the value of its flag and can never be parsed as another flag (spec R4).
function projectArgs(service: Service): string[] {
  return service.projectName === null ? [] : [`--project-name=${service.projectName}`]
}

function fileArgs(service: Service): string[] {
  return service.configFiles.map((file) => {
    if (!file.startsWith('/')) {
      throw new InvalidServiceError(`config file is not an absolute path: ${file}`)
    }
    return `--file=${file}`
  })
}

/**
 * `docker` arguments to start a service, for `execFile` — never joined into a shell string.
 * A never-started pin has no project name / files: Compose resolves them from the working dir.
 */
export function buildUpArgs(service: Service): string[] {
  return ['compose', ...projectArgs(service), ...fileArgs(service), 'up', '-d', '--wait', '--wait-timeout', WAIT_TIMEOUT_SECONDS]
}

/** Stop by project label, without `--file`, so it works even when the folder is gone (spec UC2). */
export function buildStopArgs(service: Service): string[] {
  if (service.projectName === null) {
    throw new InvalidServiceError('a service with no project name has no container to stop')
  }
  return ['compose', ...projectArgs(service), 'stop']
}
