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
          url: 'http://localhost:9000',
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

    expect(result.entries).toEqual([{ workingDir: '/srv/app', project: 'app-qa', pinned: true, hidden: false }])
  })

  it('treats an empty file as no entries and no errors', () => {
    expect(validatePinFile(null)).toEqual({ entries: [], errors: [] })
  })

  it('rejects a document that is not a mapping with a services list', () => {
    expect(validatePinFile(['/srv/app']).errors).toHaveLength(1)
    expect(validatePinFile({ services: 'nope' }).errors).toHaveLength(1)
  })

  it('rejects an entry whose workingDir is missing or relative (spec R4)', () => {
    const result = validatePinFile({ services: [{ name: 'no dir' }, { workingDir: 'projects/app' }] })

    expect(result.entries).toEqual([])
    expect(result.errors).toHaveLength(2)
  })

  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'ssh://host', 'not a url'])(
    'drops a url that is not http or https (spec R6): %s',
    (url) => {
      const result = validatePinFile({ services: [{ workingDir: '/srv/app', url, healthUrl: url }] })

      expect(result.entries).toEqual([{ workingDir: '/srv/app', pinned: false, hidden: false }])
      expect(result.errors).toHaveLength(2)
    }
  )

  it('reports fields of the wrong type and unknown keys, and keeps the entry', () => {
    const result = validatePinFile({ services: [{ workingDir: '/srv/app', pinned: 'yes', colour: 'blue' }] })

    expect(result.entries).toEqual([{ workingDir: '/srv/app', pinned: false, hidden: false }])
    expect(result.errors).toHaveLength(2)
  })
})
