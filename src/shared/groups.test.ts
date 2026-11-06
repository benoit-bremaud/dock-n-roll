import { describe, expect, it } from 'vitest'
import { groupSummary, membersOf, runningSummary, ungrouped } from './groups'
import type { ServiceView } from './ipc'

function view(id: string, groups: readonly string[], status: ServiceView['status'] = 'off'): ServiceView {
  return { id, displayName: id, workingDir: `/srv/${id}`, status, controls: { start: true, stop: false, restart: false }, hasUrl: false, reason: null, groups }
}

describe('groups view (#98)', () => {
  const services = [view('api', ['HappiHub'], 'on'), view('web', ['HappiHub', 'QA']), view('blog', [])]

  it('lists the members of a group in list order, a service of several groups under each', () => {
    expect(membersOf(services, 'HappiHub').map((s) => s.id)).toEqual(['api', 'web'])
    expect(membersOf(services, 'QA').map((s) => s.id)).toEqual(['web'])
  })

  it('keeps the services of no group apart', () => {
    expect(ungrouped(services).map((s) => s.id)).toEqual(['blog'])
  })

  it('summarises how many members are on', () => {
    expect(groupSummary(membersOf(services, 'HappiHub'))).toBe('1 of 2 on')
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
