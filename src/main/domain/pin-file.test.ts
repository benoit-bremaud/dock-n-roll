import { describe, expect, it } from 'vitest'
import { validatePinFile } from './pin-file'

describe('validatePinFile', () => {
  it('accepts a complete entry and defaults pinned / hidden to false', () => {
    const result = validatePinFile({
      services: [
        {
          workingDir: '/home/u/sonarqube-stack',
          name: 'SonarQube',
          url: 'http://localhost:9000',
          healthUrl: 'https://localhost:9000/api/system/status'
        }
      ]
    })

    expect(result).toEqual({
      entries: [
        {
          workingDir: '/home/u/sonarqube-stack',
          name: 'SonarQube',
          url: 'http://localhost:9000/',
          healthUrl: 'https://localhost:9000/api/system/status',
          pinned: false,
          hidden: false
        }
      ],
      errors: []
    })
  })

  it('keeps the optional project key that narrows a pin to one project of a shared dir', () => {
    const result = validatePinFile({ services: [{ workingDir: '/srv/app', project: 'app-qa', pinned: true }] })

    expect(result).toEqual({ entries: [{ workingDir: '/srv/app', project: 'app-qa', pinned: true, hidden: false }], errors: [] })
  })

  it('normalizes the working dir so it matches the Compose label', () => {
    expect(validatePinFile({ services: [{ workingDir: '/srv//app/' }] }).entries).toEqual([
      { workingDir: '/srv/app', pinned: false, hidden: false }
    ])
  })

  it.each([null, undefined])('treats an empty file (%s) as no entries and no errors', (document) => {
    expect(validatePinFile(document)).toEqual({ entries: [], errors: [] })
  })

  it('accepts an empty services list', () => {
    expect(validatePinFile({ services: [] })).toEqual({ entries: [], errors: [] })
  })

  it.each([['/srv/app'], { services: 'nope' }, {}])('rejects a document that is not a mapping with a services list: %j', (document) => {
    expect(validatePinFile(document)).toEqual({ entries: [], errors: ['expected a mapping with a `services` list'] })
  })

  it('rejects an entry that is not a mapping', () => {
    expect(validatePinFile({ services: ['/srv/app'] })).toEqual({ entries: [], errors: ['services[0]: expected a mapping'] })
  })

  it.each([{ name: 'no dir' }, { workingDir: 'projects/app' }, { workingDir: '/a\0b' }])(
    'rejects an entry whose workingDir is missing, relative or invalid (spec R4): %j',
    (entry) => {
      expect(validatePinFile({ services: [entry] })).toEqual({ entries: [], errors: ['services[0]: workingDir must be an absolute path'] })
    }
  )

  it.each(['', 'App', 'my app', '--project-directory=/tmp'])(
    'rejects the whole entry when project is not a valid Compose name, instead of widening it to the dir: %j',
    (project) => {
      expect(validatePinFile({ services: [{ workingDir: '/srv/app', project, hidden: true }] })).toEqual({
        entries: [],
        errors: ['services[0].project: not a valid Compose project name; entry ignored']
      })
    }
  )

  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'ssh://host', 'not a url', 'http://user:pass@host'])(
    'drops a url that is not plain http or https (spec R6): %s',
    (url) => {
      expect(validatePinFile({ services: [{ workingDir: '/srv/app', url, healthUrl: url }] })).toEqual({
        entries: [{ workingDir: '/srv/app', pinned: false, hidden: false }],
        errors: [
          'services[0].url: only http and https URLs without credentials are allowed',
          'services[0].healthUrl: only http and https URLs without credentials are allowed'
        ]
      })
    }
  )

  it('stores the normalized URL, not the raw text', () => {
    expect(validatePinFile({ services: [{ workingDir: '/srv/app', url: ' HTTP://localhost:9000' }] }).entries[0]?.url).toBe('http://localhost:9000/')
  })

  it('reports fields of the wrong type and unknown keys, and keeps the entry', () => {
    const result = validatePinFile({ services: [{ workingDir: '/srv/app', name: '   ', pinned: 'yes', hidden: 1, colour: 'blue' }] })

    expect(result).toEqual({
      entries: [{ workingDir: '/srv/app', pinned: false, hidden: false }],
      errors: [
        'services[0].colour: unknown key',
        'services[0].name: expected a non-empty string',
        'services[0].pinned: expected true or false',
        'services[0].hidden: expected true or false'
      ]
    })
  })

  it('rejects a second entry for the same working dir and project', () => {
    const result = validatePinFile({ services: [{ workingDir: '/srv/app' }, { workingDir: '/srv/app/', name: 'dup' }] })

    expect(result).toEqual({
      entries: [{ workingDir: '/srv/app', pinned: false, hidden: false }],
      errors: ['services[1]: duplicate of an earlier entry for the same workingDir and project; entry ignored']
    })
  })

  it('keeps group names trimmed and de-duplicated', () => {
    const result = validatePinFile({ services: [{ workingDir: '/srv/app', groups: [' QA', 'demo', 'QA '] }] })

    expect(result).toEqual({ entries: [{ workingDir: '/srv/app', groups: ['QA', 'demo'], pinned: false, hidden: false }], errors: [] })
  })

  it.each([['QA'], [['QA', '']], [['QA', 3]], [[]]])('ignores a groups field that is not a non-empty list of names: %j', (groups) => {
    const result = validatePinFile({ services: [{ workingDir: '/srv/app', groups }] })

    expect(result).toEqual({
      entries: [{ workingDir: '/srv/app', pinned: false, hidden: false }],
      errors: ['services[0].groups: expected a list of non-empty names']
    })
  })
})
