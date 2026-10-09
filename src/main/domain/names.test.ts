import { describe, expect, it } from 'vitest'
import { defaultProjectName, isValidProjectName, normalizeAbsolutePath } from './names'

describe('isValidProjectName — Compose project name rule', () => {
  it.each(['sonarqube', 'projet-ind-2-inscription', 'app_qa', '0app'])('accepts %s', (name) => {
    expect(isValidProjectName(name)).toBe(true)
  })

  it.each(['', '-p', '_app', 'App', 'my app', 'a\nb', 'x=y', '--project-directory=/tmp'])('rejects %j', (name) => {
    expect(isValidProjectName(name)).toBe(false)
  })
})

describe('defaultProjectName — what Compose derives from a directory name', () => {
  it('lowercases and drops characters Compose does not allow', () => {
    expect(defaultProjectName('/home/u/My.Project')).toBe('myproject')
  })

  it('strips leading separators', () => {
    expect(defaultProjectName('/srv/_-app')).toBe('app')
  })

  it('returns null when nothing valid is left', () => {
    expect(defaultProjectName('/srv/...')).toBeNull()
  })
})

describe('normalizeAbsolutePath — spec R4', () => {
  it.each([
    ['/home/x/', '/home/x'],
    ['/home//x', '/home/x'],
    ['/home/./x', '/home/x'],
    ['/home/y/../x', '/home/x'],
    ['/', '/']
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeAbsolutePath(input)).toBe(expected)
  })

  it.each(['home/x', '', './x', '/a\0b'])('rejects %j', (input) => {
    expect(normalizeAbsolutePath(input)).toBeNull()
  })
})
