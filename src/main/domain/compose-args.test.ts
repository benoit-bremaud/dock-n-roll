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

const WAIT = ['up', '-d', '--wait', '--wait-timeout=180']

describe('buildUpArgs — spec UC1 and R4', () => {
  it('uses --flag=value forms and one --file= per config file', () => {
    const args = buildUpArgs(service({ configFiles: ['/srv/app/compose.yaml', '/srv/app/compose.override.yaml'] }))

    expect(args).toEqual([
      'compose',
      '--project-name=app',
      '--project-directory=/srv/app',
      '--file=/srv/app/compose.yaml',
      '--file=/srv/app/compose.override.yaml',
      ...WAIT
    ])
  })

  it('lets Compose resolve name and files for a pin never started (UC1-3a)', () => {
    expect(buildUpArgs(service({ projectName: null, configFiles: [] }))).toEqual(['compose', '--project-directory=/srv/app', ...WAIT])
  })

  it('passes the pin project name for a never-started pin that names one', () => {
    expect(buildUpArgs(service({ projectName: 'app-qa', configFiles: [] }))).toEqual([
      'compose',
      '--project-name=app-qa',
      '--project-directory=/srv/app',
      ...WAIT
    ])
  })

  it.each(['compose.yaml', '-f/etc/x'])('rejects a config file that is not an absolute path: %j', (file) => {
    expect(() => buildUpArgs(service({ configFiles: [file] }))).toThrow(InvalidServiceError)
  })

  it('rejects a working dir that is not an absolute path', () => {
    expect(() => buildUpArgs(service({ workingDir: 'srv/app' }))).toThrow(InvalidServiceError)
  })

  it.each(['', '--project-directory=/tmp', 'My App'])('refuses a project name Compose would not accept: %j', (projectName) => {
    expect(() => buildUpArgs(service({ projectName }))).toThrow(InvalidServiceError)
    expect(() => buildStopArgs(service({ projectName }))).toThrow(InvalidServiceError)
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
