import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { composeEnv, resolveProjectName, runCompose } from './compose-runner'

// A stand-in for the docker CLI: records how it was called and answers like Compose would.
const FAKE_DOCKER = `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args.includes('--fail')) { process.stderr.write('boom: no such service'); process.exit(3) }
if (args.includes('config')) {
  const dir = args.find((a) => a.startsWith('--project-directory=')).split('=')[1]
  process.stdout.write(dir.endsWith('broken') ? 'not json' : JSON.stringify({ name: dir.endsWith('stack') ? 'sonarqube' : 'Bad Name' }))
  process.exit(0)
}
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('COMPOSE_') || k.startsWith('DOCKER_')))
process.stdout.write(JSON.stringify({ args, cwd: process.cwd(), env }))
`

let dir: string
let docker: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'dock-n-roll-runner-'))
  docker = join(dir, 'docker')
  writeFileSync(docker, FAKE_DOCKER)
  chmodSync(docker, 0o755)
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('composeEnv — ADR-0002 environment', () => {
  it('removes every COMPOSE_* variable and the Docker daemon selectors, keeps the rest', () => {
    const env = composeEnv({
      PATH: '/usr/bin',
      HOME: '/home/u',
      COMPOSE_FILE: 'other.yaml',
      COMPOSE_PROJECT_NAME: 'other',
      COMPOSE_ENV_FILES: '.env.prod',
      DOCKER_HOST: 'tcp://remote:2375',
      DOCKER_CONTEXT: 'remote'
    })

    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/home/u' })
  })
})

describe('runCompose', () => {
  it('passes the argument array untouched, in the given cwd, without the stripped variables', async () => {
    const args = ['compose', '--project-name=app', 'up', '-d', '--wait']
    const result = await runCompose(args, { cwd: dir, docker, env: { PATH: process.env['PATH'] ?? '', COMPOSE_FILE: 'x', DOCKER_HOST: 'tcp://x' } })

    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ args, cwd: dir, env: {} })
  })

  it('does not interpret shell metacharacters in arguments', async () => {
    const args = ['compose', '--project-name=$(touch /tmp/pwned);x', 'stop']
    const result = await runCompose(args, { cwd: dir, docker })

    expect((JSON.parse(result.stdout) as { args: string[] }).args).toEqual(args)
  })

  it('reports a non-zero exit with its stderr instead of throwing', async () => {
    await expect(runCompose(['compose', '--fail'], { cwd: dir, docker })).resolves.toEqual({
      exitCode: 3,
      stdout: '',
      stderr: 'boom: no such service'
    })
  })

  it('reports a missing executable as a failed run', async () => {
    const result = await runCompose(['compose', 'stop'], { cwd: dir, docker: join(dir, 'no-such-docker') })

    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('ENOENT')
  })
})

describe('resolveProjectName — spec §10 P1', () => {
  it('reads the project name Compose resolves from the compose file', async () => {
    await expect(resolveProjectName('/home/u/sonarqube-stack', { docker })).resolves.toBe('sonarqube')
  })

  it('returns null when the resolved name does not follow the Compose name rule', async () => {
    await expect(resolveProjectName('/home/u/app', { docker })).resolves.toBeNull()
  })

  it('returns null when Compose output is not JSON', async () => {
    await expect(resolveProjectName('/home/u/broken', { docker })).resolves.toBeNull()
  })
})
