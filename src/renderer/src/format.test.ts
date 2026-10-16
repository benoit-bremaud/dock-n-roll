import { describe, expect, it } from 'vitest'
import { isFollowing, runningSummary, shortenPath } from './format'

describe('shortenPath — home folder shown as ~', () => {
  it.each([
    ['/home/u/Documents/blog', '/home/u', '~/Documents/blog'],
    ['/home/u', '/home/u', '~'],
    ['/home/u/x', '/home/u/', '~/x'],
    ['/home/user2/x', '/home/u', '/home/user2/x'],
    ['/srv/blog', '/home/u', '/srv/blog'],
    ['/srv/blog', '', '/srv/blog'],
    ['/srv/blog', '/', '/srv/blog']
  ])('%s with home %j → %s', (path, home, expected) => {
    expect(shortenPath(path, home)).toBe(expected)
  })
})

describe('runningSummary — header line', () => {
  it('counts the services that are on', () => {
    expect(runningSummary(['on', 'off', 'on', 'conflict'])).toBe('2 of 4 on')
  })

  it('says nothing when there is no service', () => {
    expect(runningSummary([])).toBeNull()
  })
})

describe('isFollowing — UC7 logs autoscroll', () => {
  it.each([
    [1000, 900, 100, true],
    [1000, 880, 100, true],
    [1000, 870, 100, false],
    [1000, 0, 100, false],
    [100, 0, 100, true]
  ])('height %i, top %i, client %i → %s', (scrollHeight, scrollTop, clientHeight, expected) => {
    expect(isFollowing({ scrollHeight, scrollTop, clientHeight })).toBe(expected)
  })
})
