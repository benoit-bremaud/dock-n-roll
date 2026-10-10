import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { composeEnv, resolveProjectName, runCompose } from './compose-runner'

// A stand-in for the docker CLI. Every call is appended to $FAKE_DOCKER_LOG (args, cwd and the
// Docker / Compose variables it received); answers depend on the arguments.
const FAKE_DOCKER = `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const { basename } = require('node:path')
const args = process.argv.slice(2)
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('COMPOSE_') || k.startsWith('DOCKER_')))
appendFileSync(process.env.FAKE_DOCKER_LOG, JSON.stringify({ args, cwd: process.cwd(), env }) + '\\n')
if (args.includes('--fail')) { process.stderr.write('boom: no such service'); process.exit(3) }
if (args.includes('--hang')) { process.stderr.write('Container app-web-1 Starting\\n'); setInterval(() => {}, 1000) }
if (args.includes('--hang-ignoring-term')) { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000) }
if (args.includes('config')) {
  const dir = basename(process.cwd())
  process.stdout.write(dir === 'broken' ? 'not json' : JSON.stringify({ name: dir === 'sonarqube-stack' ? 'sonarqube' : 'Bad Name' }))
  process.exit(0)
}
process.stdout.write('ok')
`

let root: string
let docker: string
let log: string

function calls(): { args: string[]; cwd: string; env: Record<string, string> }[] {
  return readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as { args: string[]; cwd: string; env: Record<string, string> })
}

const baseEnv = (): NodeJS.ProcessEnv => ({ PATH: process.env['PATH'] ?? '', FAKE_DOCKER_LOG: log })

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'dock-n-roll-runner-'))
  docker = join(root, 'docker')
  writeFileSync(docker, FAKE_DOCKER)
  chmodSync(docker, 0o755)
  for (const dir of ['sonarqube-stack', 'app', 'broken']) mkdirSync(join(root, dir))
})

beforeEach(() => {
  log = join(root, `calls-${String(Date.now())}-${String(Math.random())}.log`)
  writeFileSync(log, '')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('composeEnv — ADR-0002 environment', () => {
  it('removes COMPOSE_* and daemon selectors, and pins the daemon to the observed socket', () => {
    const env = composeEnv(
      {
        PATH: '/usr/bin',
        HOME: '/home/u',
        COMPOSE_FILE: 'other.yaml',
        COMPOSE_PROJECT_NAME: 'other',
        COMPOSE_ENV_FILES: '.env.prod',
        DOCKER_HOST: 'tcp://remote:2375',
        DOCKER_CONTEXT: 'remote'
      },
      '/var/run/docker.sock'
    )

    // DOCKER_HOST overrides the context selected in ~/.docker/config.json (`docker context use`).
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/home/u', DOCKER_HOST: 'unix:///var/run/docker.sock' })
  })
})

describe('runCompose', () => {
  it('passes the argument array untouched, in the given cwd, with the pinned daemon only', async () => {
    const args = ['compose', '--project-name=app', 'up', '-d', '--wait']
    const result = await runCompose(args, { cwd: join(root, 'app'), docker, env: { ...baseEnv(), COMPOSE_FILE: 'x', DOCKER_HOST: 'tcp://x' } })

    expect(result).toEqual({ exitCode: 0, stdout: 'ok', stderr: '' })
    expect(calls()).toEqual([{ args, cwd: join(root, 'app'), env: { DOCKER_HOST: 'unix:///var/run/docker.sock' } }])
  })

  it('does not interpret shell metacharacters in arguments', async () => {
    const marker = join(root, 'pwned')
    const args = ['compose', `--project-name=$(touch ${marker});x`, 'stop']
    await runCompose(args, { cwd: root, docker, env: baseEnv() })

    expect(calls()[0]?.args).toEqual(args)
    expect(existsSync(marker)).toBe(false)
  })

  it('reports a non-zero exit with its stderr instead of throwing', async () => {
    await expect(runCompose(['compose', '--fail'], { cwd: root, docker, env: baseEnv() })).resolves.toEqual({
      exitCode: 3,
      stdout: '',
      stderr: 'boom: no such service'
    })
  })

  it('reports a missing executable as a failed run', async () => {
    const result = await runCompose(['compose', 'stop'], { cwd: root, docker: join(root, 'no-such-docker'), env: baseEnv() })

    expect(result.exitCode).toBe(-1)
    expect(result.stderr).toContain('ENOENT')
  })

  it('names the timeout as the cause, ahead of the progress Compose wrote', async () => {
    const result = await runCompose(['compose', '--hang'], { cwd: root, docker, env: baseEnv(), timeoutMs: 200 })

    expect(result.exitCode).toBe(-1)
    expect(result.stderr).toMatch(/^timed out after 0\.2 s/)
    expect(result.stderr).toContain('Container app-web-1 Starting')
  })

  it('kills a run that ignores SIGTERM after the grace period', async () => {
    const started = Date.now()
    const result = await runCompose(['compose', '--hang-ignoring-term'], { cwd: root, docker, env: baseEnv(), timeoutMs: 100, killGraceMs: 200 })

    expect(result.exitCode).toBe(-1)
    expect(Date.now() - started).toBeLessThan(3000)
  })

  it('reports an argument the OS refuses as a failed run, never a rejection', async () => {
    await expect(runCompose(['compose', 'a\0b'], { cwd: root, docker, env: baseEnv() })).resolves.toMatchObject({ exitCode: -1 })
  })
})

describe('resolveProjectName — spec §10 P1', () => {
  it('reads the name Compose resolves, running in the project dir with remote includes disabled', async () => {
    const dir = join(root, 'sonarqube-stack')

    await expect(resolveProjectName(dir, { docker, env: baseEnv() })).resolves.toBe('sonarqube')
    expect(calls()).toEqual([
      {
        args: ['compose', `--project-directory=${dir}`, 'config', '--format=json'],
        cwd: dir,
        env: {
          DOCKER_HOST: 'unix:///var/run/docker.sock',
          COMPOSE_EXPERIMENTAL_GIT_REMOTE: '0',
          COMPOSE_EXPERIMENTAL_OCI_REMOTE: '0'
        }
      }
    ])
  })

  it('returns null when the resolved name does not follow the Compose name rule', async () => {
    await expect(resolveProjectName(join(root, 'app'), { docker, env: baseEnv() })).resolves.toBeNull()
  })

  it('returns null when Compose output is not JSON', async () => {
    await expect(resolveProjectName(join(root, 'broken'), { docker, env: baseEnv() })).resolves.toBeNull()
  })

  it('returns null when the dir no longer exists', async () => {
    await expect(resolveProjectName(join(root, 'gone'), { docker, env: baseEnv() })).resolves.toBeNull()
  })
})
