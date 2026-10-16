import { describe, expect, it } from 'vitest'
import { crashedContainers, crashMessage } from './crash'
import { container } from './test-fixtures'

const running = container({ id: 'a', name: 'blog-web-1' })

describe('crashedContainers — spec UC3 extension 3b', () => {
  it.each([1, 2, 139, 255])('reports a running container that exited with %i', (exitCode) => {
    const after = container({ id: 'a', state: 'exited', exitCode })

    expect(crashedContainers([running], [after])).toEqual([after])
  })

  it.each([0, 130, 137, 143])('ignores the exit %i of a normal or signalled stop', (exitCode) => {
    expect(crashedContainers([running], [container({ id: 'a', state: 'exited', exitCode })])).toEqual([])
  })

  it('reports an out-of-memory kill, whatever the exit code', () => {
    const after = container({ id: 'a', state: 'exited', exitCode: 137, oomKilled: true })

    expect(crashedContainers([running], [after])).toEqual([after])
  })

  it('reports a running container that Docker is restarting, and a dead one', () => {
    const restarting = container({ id: 'a', state: 'restarting' })
    const dead = container({ id: 'b', state: 'dead', exitCode: 1 })

    expect(crashedContainers([running, container({ id: 'b' })], [restarting, dead])).toEqual([restarting, dead])
  })

  it('ignores containers that were not running before, are new or were removed', () => {
    const wasExited = container({ id: 'a', state: 'exited', exitCode: 1 })

    expect(crashedContainers([wasExited], [container({ id: 'a', state: 'exited', exitCode: 1 })])).toEqual([])
    expect(crashedContainers([], [container({ id: 'n', state: 'exited', exitCode: 1 })])).toEqual([])
    expect(crashedContainers([running], [])).toEqual([])
  })
})

describe('crashMessage', () => {
  it.each([
    [container({ name: 'web', state: 'exited', exitCode: 1 }), 'web exited with code 1'],
    [container({ name: 'web', state: 'exited', exitCode: 137, oomKilled: true }), 'web was killed: out of memory'],
    [container({ name: 'web', state: 'restarting' }), 'web crashed and is restarting'],
    [container({ name: 'web', state: 'dead', exitCode: null }), 'web died']
  ])('describes the crash', (crashed, message) => {
    expect(crashMessage(crashed)).toBe(message)
  })
})
