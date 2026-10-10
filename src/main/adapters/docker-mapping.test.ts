import { describe, expect, it } from 'vitest'
import { containerIds, parseDockerEvent, toContainerSnapshot } from './docker-mapping'

// Shape of `GET /v1.47/containers/{id}/json` recorded on Docker Engine 29.8.2 (paths anonymized).
const INSPECT_RUNNING = {
  Id: 'abc123',
  Name: '/sonarqube',
  Config: {
    Image: 'sonarqube:community',
    Labels: {
      'com.docker.compose.project': 'sonarqube',
      'com.docker.compose.project.working_dir': '/home/u/sonarqube-stack',
      'com.docker.compose.project.config_files': '/home/u/sonarqube-stack/docker-compose.yml'
    }
  },
  State: { Status: 'running', ExitCode: 0, Health: { Status: 'healthy', FailingStreak: 0 } },
  NetworkSettings: {
    Ports: {
      '9000/tcp': [
        { HostIp: '0.0.0.0', HostPort: '9000' },
        { HostIp: '::', HostPort: '9000' }
      ],
      '9092/tcp': null
    }
  }
}

describe('toContainerSnapshot', () => {
  it('maps a recorded inspect response to the domain snapshot', () => {
    expect(toContainerSnapshot(INSPECT_RUNNING)).toEqual({
      id: 'abc123',
      name: 'sonarqube',
      image: 'sonarqube:community',
      state: 'running',
      exitCode: null,
      health: 'healthy',
      labels: INSPECT_RUNNING.Config.Labels,
      publishedPorts: [
        { hostIp: '0.0.0.0', hostPort: 9000, containerPort: 9000, protocol: 'tcp' },
        { hostIp: '::', hostPort: 9000, containerPort: 9000, protocol: 'tcp' }
      ]
    })
  })

  it('keeps the exit code only once the container has stopped', () => {
    const exited = { ...INSPECT_RUNNING, State: { Status: 'exited', ExitCode: 0 } }

    expect(toContainerSnapshot(exited)).toMatchObject({ state: 'exited', exitCode: 0, health: null })
  })

  it('reads a container without HEALTHCHECK, labels or ports', () => {
    const bare = { Id: 'x', Name: '/bare', Config: { Image: 'alpine', Labels: null }, State: { Status: 'created', ExitCode: 0 }, NetworkSettings: { Ports: {} } }

    expect(toContainerSnapshot(bare)).toEqual({
      id: 'x',
      name: 'bare',
      image: 'alpine',
      state: 'created',
      exitCode: null,
      health: null,
      labels: {},
      publishedPorts: []
    })
  })

  it('drops label values that are not strings', () => {
    const odd = { ...INSPECT_RUNNING, Config: { Image: 'x', Labels: { ok: 'yes', bad: 3 } } }

    expect(toContainerSnapshot(odd)?.labels).toEqual({ ok: 'yes' })
  })

  it.each([null, 'text', {}, { Id: 'x' }, { ...INSPECT_RUNNING, State: { Status: 'flying' } }])(
    'returns null for a response it cannot trust: %j',
    (response) => {
      expect(toContainerSnapshot(response)).toBeNull()
    }
  )
})

describe('parseDockerEvent', () => {
  it.each([
    ['{"Type":"container","Action":"die","Actor":{"ID":"abc","Attributes":{"exitCode":"137"}}}', { id: 'abc', kind: 'changed' }],
    ['{"Type":"container","Action":"health_status: healthy","Actor":{"ID":"abc"}}', { id: 'abc', kind: 'changed' }],
    ['{"Type":"container","Action":"pause","Actor":{"ID":"abc"}}', { id: 'abc', kind: 'changed' }],
    ['{"Type":"container","Action":"destroy","Actor":{"ID":"abc"}}', { id: 'abc', kind: 'removed' }]
  ])('reads %s', (line, expected) => {
    expect(parseDockerEvent(line)).toEqual(expected)
  })

  it.each([
    '{"Type":"container","Action":"exec_start: sh","Actor":{"ID":"abc"}}',
    '{"Type":"container","Action":"attach","Actor":{"ID":"abc"}}',
    '{"Type":"network","Action":"connect","Actor":{"ID":"net"}}',
    'not json',
    ''
  ])('ignores events that cannot change a status: %s', (line) => {
    expect(parseDockerEvent(line)).toBeNull()
  })
})

describe('containerIds', () => {
  it('reads the ids of a container list and skips malformed items', () => {
    expect(containerIds([{ Id: 'a' }, { Id: 3 }, null, 'x', { Id: 'b' }])).toEqual(['a', 'b'])
  })

  it('returns no id for a response that is not a list', () => {
    expect(containerIds({ message: 'error' })).toEqual([])
  })
})
