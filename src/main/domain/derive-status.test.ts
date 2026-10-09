import { describe, expect, it } from 'vitest'
import { allowedControls, deriveStatus } from './derive-status'
import { container } from './test-fixtures'
import type { StatusInputs } from './types'

const running = container({ id: 'a', state: 'running' })
const healthy = container({ id: 'b', state: 'running', health: 'healthy' })
const booting = container({ id: 'c', state: 'running', health: 'starting' })
const stopped = container({ id: 'd', state: 'exited', exitCode: 137 })
const initJobDone = container({ id: 'e', state: 'exited', exitCode: 0 })

function inputs(overrides: Partial<StatusInputs> = {}): StatusInputs {
  return { containers: [running], pending: null, filesExist: true, conflict: false, healthGate: 'none', ...overrides }
}

describe('deriveStatus — spec §4 precedence', () => {
  it('is on when every relevant container is running and healthy', () => {
    expect(deriveStatus(inputs({ containers: [running, healthy] }))).toBe('on')
  })

  it('is off when every container is stopped', () => {
    expect(deriveStatus(inputs({ containers: [stopped] }))).toBe('off')
  })

  it('is off, not on, for a pinned service with no container yet', () => {
    expect(deriveStatus(inputs({ containers: [] }))).toBe('off')
  })

  it('is partial when some containers run and others are stopped', () => {
    expect(deriveStatus(inputs({ containers: [running, stopped] }))).toBe('partial')
  })

  it('counts an init job that exited 0 as done while another container runs', () => {
    expect(deriveStatus(inputs({ containers: [healthy, initJobDone] }))).toBe('on')
  })

  it('is off when the only remaining container is a finished init job', () => {
    expect(deriveStatus(inputs({ containers: [initJobDone] }))).toBe('off')
  })

  it('is starting while a container health check is still starting, even without a pending start', () => {
    expect(deriveStatus(inputs({ containers: [healthy, booting] }))).toBe('starting')
  })

  it('is starting while the healthUrl gate has not passed yet', () => {
    expect(deriveStatus(inputs({ containers: [running], healthGate: 'waiting' }))).toBe('starting')
  })

  it('is on once the healthUrl gate has passed', () => {
    expect(deriveStatus(inputs({ containers: [running], healthGate: 'passed' }))).toBe('on')
  })

  it('waits for the healthUrl gate even when an init job is done', () => {
    expect(deriveStatus(inputs({ containers: [running, initJobDone], healthGate: 'waiting' }))).toBe('starting')
  })

  it('ignores the healthUrl gate when a container has its own HEALTHCHECK (spec §3)', () => {
    expect(deriveStatus(inputs({ containers: [healthy], healthGate: 'waiting' }))).toBe('on')
  })

  it('does not apply the healthUrl gate while some containers are stopped', () => {
    expect(deriveStatus(inputs({ containers: [running, stopped], healthGate: 'waiting' }))).toBe('partial')
  })

  it('ignores a stale health status left on a stopped container', () => {
    expect(deriveStatus(inputs({ containers: [container({ state: 'exited', exitCode: 0, health: 'starting' })] }))).toBe('off')
  })

  it('does not count an init job as done next to a container still booting', () => {
    expect(deriveStatus(inputs({ containers: [booting, initJobDone] }))).toBe('starting')
  })

  it('counts a dead container as stopped', () => {
    expect(deriveStatus(inputs({ containers: [container({ state: 'dead' })] }))).toBe('off')
  })

  it.each(['restarting', 'paused', 'removing'] as const)('is partial when a container is %s', (state) => {
    expect(deriveStatus(inputs({ containers: [container({ state })] }))).toBe('partial')
  })

  it('is partial when a container is unhealthy', () => {
    expect(deriveStatus(inputs({ containers: [container({ state: 'running', health: 'unhealthy' })] }))).toBe('partial')
  })

  it('is starting while a start is pending, whatever the containers say', () => {
    expect(deriveStatus(inputs({ containers: [stopped], pending: 'start' }))).toBe('starting')
  })

  it('is stopping while a stop is pending, before starting', () => {
    expect(deriveStatus(inputs({ containers: [booting], pending: 'stop' }))).toBe('stopping')
  })

  it('is missing when files are gone, before any pending operation', () => {
    expect(deriveStatus(inputs({ filesExist: false, pending: 'stop' }))).toBe('missing')
  })

  it('is conflict above everything else', () => {
    expect(deriveStatus(inputs({ conflict: true, filesExist: false, pending: 'start' }))).toBe('conflict')
  })
})

describe('allowedControls — spec §4 Start / Stop columns', () => {
  it('allows only start when off', () => {
    expect(allowedControls('off', inputs({ containers: [stopped] }))).toEqual({ start: true, stop: false })
  })

  it('allows only stop when on', () => {
    expect(allowedControls('on', inputs({ containers: [running] }))).toEqual({ start: false, stop: true })
  })

  it('allows both when partial', () => {
    expect(allowedControls('partial', inputs({ containers: [running, stopped] }))).toEqual({ start: true, stop: true })
  })

  it('allows nothing on conflict', () => {
    expect(allowedControls('conflict', inputs({ conflict: true }))).toEqual({ start: false, stop: false })
  })

  it('allows stop on missing only while containers still run', () => {
    expect(allowedControls('missing', inputs({ filesExist: false, containers: [running, stopped] }))).toEqual({ start: false, stop: true })
    expect(allowedControls('missing', inputs({ filesExist: false, containers: [stopped] }))).toEqual({ start: false, stop: false })
  })

  it('allows nothing on missing while an operation is pending', () => {
    expect(allowedControls('missing', inputs({ filesExist: false, containers: [running], pending: 'start' }))).toEqual({ start: false, stop: false })
  })

  it.each(['restarting', 'removing'] as const)('disables start on partial while a container is %s', (state) => {
    expect(allowedControls('partial', inputs({ containers: [running, container({ id: 'x', state })] }))).toEqual({ start: false, stop: true })
  })

  it('allows stop on a container-driven starting, not on a pending start', () => {
    expect(allowedControls('starting', inputs({ containers: [booting] }))).toEqual({ start: false, stop: true })
    expect(allowedControls('starting', inputs({ containers: [running], pending: 'start' }))).toEqual({ start: false, stop: false })
  })

  it('allows nothing while stopping', () => {
    expect(allowedControls('stopping', inputs({ pending: 'stop' }))).toEqual({ start: false, stop: false })
  })
})
