import { describe, expect, it } from 'vitest'
import { buildStopArgs, buildUpArgs, InvalidServiceError } from './compose-args'
import type { Service } from './types'

function service(overrides: Partial<Service> = {}): Service {
  return {
    id: '/srv/app\0app',
    projectName: 'app',
    workingDir: '/srv/app',
    configFiles: ['/srv/app/compose.yaml'],
    containers: [],
    pin: undefined,
    displayName: 'app',
    conflictingDirs: [],
    ...overrides
  }
}

const WAIT = ['up', '-d', '--wait', '--wait-timeout', '180']

describe('buildUpArgs — spec UC1 and R4', () => {
  it('uses --flag=value forms and one --file= per config file', () => {
    const args = buildUpArgs(service({ configFiles: ['/srv/app/compose.yaml', '/srv/app/compose.override.yaml'] }))

    expect(args).toEqual([
      'compose',
      '--project-name=app',
      '--file=/srv/app/compose.yaml',
      '--file=/srv/app/compose.override.yaml',
      ...WAIT
    ])
  })

  it('lets Compose resolve name and files for a pin never started (UC1-3a)', () => {
    expect(buildUpArgs(service({ projectName: null, configFiles: [] }))).toEqual(['compose', ...WAIT])
  })

  it('passes the pin project name for a never-started pin that names one', () => {
    expect(buildUpArgs(service({ projectName: 'app-qa', configFiles: [] }))).toEqual(['compose', '--project-name=app-qa', ...WAIT])
  })

  it('rejects a relative config file path', () => {
    expect(() => buildUpArgs(service({ configFiles: ['compose.yaml'] }))).toThrow(InvalidServiceError)
  })

  it('keeps a flag-shaped label value as a single inert argument', () => {
    const args = buildUpArgs(service({ projectName: '--project-directory=/tmp' }))

    expect(args).toContain('--project-name=--project-directory=/tmp')
    expect(args).not.toContain('--project-directory=/tmp')
  })
})

describe('buildStopArgs — spec UC2', () => {
  it('stops by project label, without any --file', () => {
    expect(buildStopArgs(service())).toEqual(['compose', '--project-name=app', 'stop'])
  })

  it('refuses a service with no project name: nothing to stop by label', () => {
    expect(() => buildStopArgs(service({ projectName: null }))).toThrow(InvalidServiceError)
  })
})
