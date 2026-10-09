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
    expect(allowedControls('on', inputs())).toEqual({ start: false, stop: true })
  })

  it('allows both when partial', () => {
    expect(allowedControls('partial', inputs({ containers: [running, stopped] }))).toEqual({ start: true, stop: true })
  })

  it('allows nothing on conflict', () => {
    expect(allowedControls('conflict', inputs({ conflict: true }))).toEqual({ start: false, stop: false })
  })

  it('allows stop on missing only while containers still run', () => {
    expect(allowedControls('missing', inputs({ filesExist: false }))).toEqual({ start: false, stop: true })
    expect(allowedControls('missing', inputs({ filesExist: false, containers: [stopped] }))).toEqual({ start: false, stop: false })
  })

  it('allows stop on a container-driven starting, not on a pending start', () => {
    expect(allowedControls('starting', inputs({ containers: [booting] }))).toEqual({ start: false, stop: true })
    expect(allowedControls('starting', inputs({ pending: 'start' }))).toEqual({ start: false, stop: false })
  })

  it('allows nothing while stopping', () => {
    expect(allowedControls('stopping', inputs({ pending: 'stop' }))).toEqual({ start: false, stop: false })
  })
})
