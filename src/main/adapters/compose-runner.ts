import { spawn, type ChildProcess } from 'node:child_process'
import { isValidProjectName } from '../domain/names'

/** Outcome of one `docker` run. `exitCode` is `-1` when the process gave none (timeout, kill, spawn failure). */
export interface ComposeResult {
  readonly exitCode: number
  readonly stdout: string
  /** CLI output; prefixed with the cause when the run was stopped or could not start. */
  readonly stderr: string
}

export interface RunOptions {
  /** ADR-0002: the project dir for `up` and `config`, `/` for `stop`. */
  readonly cwd: string
  /** The docker CLI; overridable for tests. */
  readonly docker?: string
  /** Environment to start from, before stripping (defaults to the app's environment). */
  readonly env?: NodeJS.ProcessEnv
  /** The daemon the app observes — the same value given to the observer; the CLI is pinned to it. */
  readonly socketPath: string
  readonly timeoutMs?: number
  /** Time between SIGTERM and SIGKILL once the timeout is reached. */
  readonly killGraceMs?: number
}

// Longer than `--wait-timeout=180` so Compose reports its own timeout first.
const DEFAULT_TIMEOUT_MS = 200_000
const DEFAULT_KILL_GRACE_MS = 5000
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024
const DAEMON_SELECTORS = new Set(['DOCKER_HOST', 'DOCKER_CONTEXT'])

/**
 * The child environment for `docker compose` (ADR-0002). Inherited `COMPOSE_*` variables would
 * add files, profiles, env files or a project name the arguments did not ask for. The daemon is
 * pinned with `DOCKER_HOST` to the socket the app observes: this also overrides a context
 * selected with `docker context use` (stored in `~/.docker/config.json`).
 */
export function composeEnv(env: NodeJS.ProcessEnv, socketPath: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !key.startsWith('COMPOSE_') && !DAEMON_SELECTORS.has(key)) {
      result[key] = value
    }
  }
  result['DOCKER_HOST'] = `unix://${socketPath}`
  return result
}

function failure(cause: string, stdout = '', stderr = ''): ComposeResult {
  return { exitCode: -1, stdout, stderr: stderr === '' ? cause : `${cause}\n${stderr}` }
}

/**
 * Runs `docker` with an argument array — no shell, so nothing in the arguments is interpreted.
 * Never rejects: a non-zero exit, a timeout, a missing executable or an argument the OS refuses
 * come back as a result with the cause. On timeout the whole process group gets SIGTERM, then
 * SIGKILL after a grace period, and the result is settled then even if an orphaned grandchild
 * (the Compose plugin) still holds the output pipes.
 */
export function runCompose(args: readonly string[], options: RunOptions, extraEnv: Record<string, string> = {}): Promise<ComposeResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return new Promise((done) => {
    let settled = false
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timers: { term?: NodeJS.Timeout; kill?: NodeJS.Timeout } = {}
    const resolve = (result: ComposeResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timers.term)
      clearTimeout(timers.kill)
      done(result)
    }
    let child: ChildProcess
    try {
      child = spawn(options.docker ?? 'docker', [...args], {
        cwd: options.cwd,
        env: { ...composeEnv(options.env ?? process.env, options.socketPath), ...extraEnv },
        // Own process group, so a timeout also reaches the Compose plugin the CLI spawns.
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (error) {
      resolve(failure(error instanceof Error ? error.message : String(error)))
      return
    }
    const signalGroup = (signal: NodeJS.Signals): void => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, signal)
      } catch {
        // Group already gone.
      }
    }
    const collect = (append: (text: string) => void) => (chunk: Buffer): void => {
      if (stdout.length + stderr.length > MAX_OUTPUT_BYTES) {
        signalGroup('SIGKILL')
        resolve(failure('output too large', stdout, stderr))
        return
      }
      append(chunk.toString('utf8'))
    }
    child.stdout?.on('data', collect((text) => (stdout += text)))
    child.stderr?.on('data', collect((text) => (stderr += text)))
    child.on('error', (error) => {
      resolve(failure(error.message, stdout, stderr))
    })
    const timeoutCause = (): string => `timed out after ${String(timeoutMs / 1000)} s`
    child.on('close', (code) => {
      if (timedOut) {
        resolve(failure(timeoutCause(), stdout, stderr))
      } else if (code === 0) {
        resolve({ exitCode: 0, stdout, stderr })
      } else if (code === null) {
        resolve(failure('killed by a signal', stdout, stderr))
      } else {
        resolve({ exitCode: code, stdout, stderr })
      }
    })
    timers.term = setTimeout(() => {
      timedOut = true
      signalGroup('SIGTERM')
      timers.kill = setTimeout(() => {
        signalGroup('SIGKILL')
        // Settle now: an orphaned grandchild may still hold the pipes open.
        resolve(failure(timeoutCause(), stdout, stderr))
      }, options.killGraceMs ?? DEFAULT_KILL_GRACE_MS)
    }, timeoutMs)
  })
}

/**
 * The project name Compose would use for a dir (compose file `name:`, project `.env`, else the
 * dir name), via `docker compose config` — read-only, no container is touched (spec §10 P1).
 * Runs in the project dir like `up` (ADR-0002), so both read the same `.env`. Remote `include:`
 * (git, OCI) is disabled: resolving a name must never fetch or clone anything.
 * `null` when the command fails or the name does not follow the Compose rule.
 */
export async function resolveProjectName(workingDir: string, options: Omit<RunOptions, 'cwd'>): Promise<string | null> {
  const result = await runCompose(
    ['compose', `--project-directory=${workingDir}`, 'config', '--format=json'],
    { ...options, cwd: workingDir, timeoutMs: options.timeoutMs ?? 15_000 },
    { COMPOSE_EXPERIMENTAL_GIT_REMOTE: '0', COMPOSE_EXPERIMENTAL_OCI_REMOTE: '0' }
  )
  if (result.exitCode !== 0) return null
  try {
    const parsed: unknown = JSON.parse(result.stdout)
    const name = typeof parsed === 'object' && parsed !== null && 'name' in parsed ? parsed.name : undefined
    return typeof name === 'string' && isValidProjectName(name) ? name : null
  } catch {
    return null
  }
}
