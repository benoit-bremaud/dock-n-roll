import { describe, expect, it } from 'vitest'
import { buildServices } from './service-catalog'
import { composeLabels, container } from './test-fixtures'
import type { PinEntry } from './types'

const STACK = '/home/u/02_personal/sonarqube-stack'
const DEV_INFRA = '/home/u/02_personal/dev-infra/sonarqube'

function pin(overrides: Partial<PinEntry> & { workingDir: string }): PinEntry {
  return { pinned: false, hidden: false, ...overrides }
}

describe('buildServices — identity and discovery (ADR-0003)', () => {
  it('groups the containers of one Compose project into one service', () => {
    const services = buildServices(
      [
        container({ id: 'w', labels: composeLabels('blog', '/srv/blog') }),
        container({ id: 'd', labels: composeLabels('blog', '/srv/blog') })
      ],
      []
    )

    expect(services).toHaveLength(1)
    expect(services[0]).toMatchObject({
      id: '/srv/blog\0blog',
      projectName: 'blog',
      workingDir: '/srv/blog',
      configFiles: ['/srv/blog/compose.yaml'],
      displayName: 'blog',
      conflictingDirs: []
    })
    expect(services[0]?.containers.map((c) => c.id)).toEqual(['w', 'd'])
  })

  it('ignores containers started outside Compose and one-off containers', () => {
    const oneOff = { ...composeLabels('blog', '/srv/blog'), 'com.docker.compose.oneoff': 'True' }

    expect(buildServices([container({ labels: {} }), container({ labels: oneOff })], [])).toEqual([])
  })

  it('flags the observed sonarqube collision: one project name, two working dirs', () => {
    const services = buildServices(
      [
        container({ id: 'sq', name: 'sonarqube', labels: composeLabels('sonarqube', STACK) }),
        container({ id: 'db', name: 'sonar-db', labels: composeLabels('sonarqube', DEV_INFRA) })
      ],
      []
    )

    expect(services).toHaveLength(2)
    expect(services.find((s) => s.workingDir === STACK)?.conflictingDirs).toEqual([DEV_INFRA])
    expect(services.find((s) => s.workingDir === DEV_INFRA)?.conflictingDirs).toEqual([STACK])
  })

  it('keeps two projects of the same dir apart (-p qa1 / -p qa2)', () => {
    const services = buildServices(
      [
        container({ id: '1', labels: composeLabels('qa1', '/srv/app') }),
        container({ id: '2', labels: composeLabels('qa2', '/srv/app') })
      ],
      []
    )

    expect(services.map((s) => s.id)).toEqual(['/srv/app\0qa1', '/srv/app\0qa2'])
    expect(services.every((s) => s.conflictingDirs.length === 0)).toBe(true)
  })
})

describe('buildServices — pin file merge and ordering', () => {
  it('applies a dir-only pin to every project of that dir', () => {
    const services = buildServices(
      [container({ labels: composeLabels('sonarqube', STACK) })],
      [pin({ workingDir: STACK, name: 'SonarQube', url: 'http://localhost:9000' })]
    )

    expect(services[0]?.displayName).toBe('SonarQube')
    expect(services[0]?.pin?.url).toBe('http://localhost:9000')
  })

  it('prefers a project-specific pin over a dir-only pin', () => {
    const services = buildServices(
      [container({ labels: composeLabels('qa2', '/srv/app') })],
      [pin({ workingDir: '/srv/app', name: 'Any' }), pin({ workingDir: '/srv/app', project: 'qa2', name: 'QA 2' })]
    )

    expect(services[0]?.displayName).toBe('QA 2')
  })

  it('creates a service with no container for a pin never started yet', () => {
    const [service] = buildServices([], [pin({ workingDir: '/srv/new-app', pinned: true })])

    expect(service).toMatchObject({
      id: '/srv/new-app',
      projectName: null,
      configFiles: [],
      containers: [],
      displayName: 'new-app'
    })
  })

  it('uses the pin project as identity when a never-started pin names one', () => {
    const [service] = buildServices([], [pin({ workingDir: '/srv/app', project: 'app-qa' })])

    expect(service).toMatchObject({ id: '/srv/app\0app-qa', projectName: 'app-qa' })
  })

  it('excludes hidden services', () => {
    expect(buildServices([container({ labels: composeLabels('noise', '/srv/noise') })], [pin({ workingDir: '/srv/noise', hidden: true })])).toEqual([])
  })

  it('lists pinned services first in pin-file order, then the others by name', () => {
    const services = buildServices(
      [
        container({ id: '1', labels: composeLabels('zeta', '/srv/zeta') }),
        container({ id: '2', labels: composeLabels('alpha', '/srv/alpha') }),
        container({ id: '3', labels: composeLabels('sonar', '/srv/sonar') }),
        container({ id: '4', labels: composeLabels('blog', '/srv/blog') })
      ],
      [pin({ workingDir: '/srv/sonar', pinned: true }), pin({ workingDir: '/srv/blog', pinned: true })]
    )

    expect(services.map((s) => s.displayName)).toEqual(['sonar', 'blog', 'alpha', 'zeta'])
  })
})
