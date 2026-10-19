import { describe, expect, it } from 'vitest'
import { isFollowing, middleEllipsis, runningSummary, shortenPath, shortenReason } from './format'

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

describe('middleEllipsis — keeps both ends of a long text', () => {
  it('leaves a text within the limit as it is', () => {
    expect(middleEllipsis('/srv/blog', 9)).toBe('/srv/blog')
  })

  it('cuts the middle and keeps the end (the file name) a little longer', () => {
    expect(middleEllipsis('/srv/a/very/long/path/compose.yaml', 20)).toBe('/srv/a/…compose.yaml')
  })

  it.each([
    [11, 'abcd…uvwxyz'],
    [3, '…yz'],
    [2, '…z'],
    [1, '…'],
    [0, '…']
  ])('cut to %i characters → %s', (max, expected) => {
    expect(middleEllipsis('abcdefghijklmnopqrstuvwxyz', max)).toBe(expected)
  })
})

describe('shortenReason — paths in a reason stay readable (#44)', () => {
  it('shows the home folder as ~ and cuts a long path in the middle', () => {
    const reason = 'compose file /home/u/Documents/clients/acme/projects/2026/backend/compose.yaml is missing'
    expect(shortenReason(reason, '/home/u')).toBe('compose file ~/Documents/cli…026/backend/compose.yaml is missing')
  })

  it('leaves a reason with short paths or none as it is', () => {
    expect(shortenReason('project name also used by /srv/x', '/home/u')).toBe('project name also used by /srv/x')
    expect(shortenReason('invalid port', '/home/u')).toBe('invalid port')
  })

  const long = '/home/u/Documents/clients/acme/projects/2026/backend'

  it('leaves the quotes and punctuation around a path outside it', () => {
    expect(shortenReason(`working dir is not an absolute path: "${long}"`, '/home/u')).toBe('working dir is not an absolute path: "~/Documents/cli…me/projects/2026/backend"')
    expect(shortenReason('folder /home/u/x, then /home/u/y.', '/home/u')).toBe('folder ~/x, then ~/y.')
  })

  it('leaves slashes that are not a path as they are', () => {
    const text = `start and/or stop, see https://example.com${long}`
    expect(shortenReason(text, '/home/u')).toBe(text)
  })

  it('shortens every path of a reason, and the home folder alone', () => {
    expect(shortenReason(`${long} and ${long}`, '/home/u')).toBe('~/Documents/cli…me/projects/2026/backend and ~/Documents/cli…me/projects/2026/backend')
    expect(shortenReason('folder /home/u is missing', '/home/u')).toBe('folder ~ is missing')
  })
})
