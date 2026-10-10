import { execFile } from 'node:child_process'
import { isValidProjectName } from '../domain/names'

export interface ComposeResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface RunOptions {
  readonly cwd: string
  /** The docker CLI; overridable for tests. */
  readonly docker?: string
  /** Environment to start from, before stripping (defaults to the app's environment). */
  readonly env?: NodeJS.ProcessEnv
  readonly timeoutMs?: number
}

// Longer than `--wait-timeout=180` so Compose reports its own timeout first.
const DEFAULT_TIMEOUT_MS = 200_000
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024
const DAEMON_SELECTORS = new Set(['DOCKER_HOST', 'DOCKER_CONTEXT'])

/**
 * The child environment for `docker compose` (ADR-0002). `COMPOSE_*` variables would add files,
 * profiles, env files or a project name the arguments did not ask for; `DOCKER_HOST` /
 * `DOCKER_CONTEXT` would send the command to another daemon than the one observed on the socket.
 */
export function composeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !key.startsWith('COMPOSE_') && !DAEMON_SELECTORS.has(key)) {
      result[key] = value
    }
  }
  return result
}

/**
 * Runs `docker` with an argument array — no shell, so nothing in the arguments is interpreted.
 * Never rejects: a non-zero exit, a timeout or a missing executable come back as a result with
 * a non-zero `exitCode` and the reason in `stderr`, for the controller to show.
 */
export function runCompose(args: readonly string[], options: RunOptions): Promise<ComposeResult> {
  return new Promise((resolve) => {
    execFile(
      options.docker ?? 'docker',
      [...args],
      {
        cwd: options.cwd,
        env: composeEnv(options.env ?? process.env),
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        encoding: 'utf8'
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ exitCode: 0, stdout, stderr })
          return
        }
        const exitCode = typeof error.code === 'number' ? error.code : -1
        resolve({ exitCode: exitCode === 0 ? -1 : exitCode, stdout, stderr: stderr === '' ? error.message : stderr })
      }
    )
  })
}

/**
 * The project name Compose would use for a dir (compose file `name:`, else the dir name), via
 * `docker compose config` — read-only, no container is touched (spec §10 P1). `null` when the
 * command fails or the name does not follow the Compose rule.
 */
export async function resolveProjectName(
  workingDir: string,
  options: Omit<RunOptions, 'cwd'> = {}
): Promise<string | null> {
  const result = await runCompose(['compose', `--project-directory=${workingDir}`, 'config', '--format=json'], {
    ...options,
    cwd: '/',
    timeoutMs: options.timeoutMs ?? 15_000
  })
  if (result.exitCode !== 0) return null
  try {
    const parsed: unknown = JSON.parse(result.stdout)
    const name = typeof parsed === 'object' && parsed !== null && 'name' in parsed ? parsed.name : undefined
    return typeof name === 'string' && isValidProjectName(name) ? name : null
  } catch {
    return null
  }
}
