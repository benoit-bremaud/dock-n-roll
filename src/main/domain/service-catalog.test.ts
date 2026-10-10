import { describe, expect, it } from 'vitest'
import { buildServices as buildWithNames } from './service-catalog'
import { composeLabels, container } from './test-fixtures'
import type { ContainerSnapshot, PinEntry, ResolvedNames } from './types'

const STACK = '/home/u/02_personal/sonarqube-stack'
const DEV_INFRA = '/home/u/02_personal/dev-infra/sonarqube'

function buildServices(containers: readonly ContainerSnapshot[], pins: readonly PinEntry[], resolvedNames: ResolvedNames = new Map()) {
  return buildWithNames(containers, pins, resolvedNames)
}

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
    expect(services.map((s) => s.conflictingDirs)).toEqual([[], []])
  })

  it('discovers a project whose containers are all stopped', () => {
    const services = buildServices([container({ state: 'exited', exitCode: 0, labels: composeLabels('blog', '/srv/blog') })], [])

    expect(services.map((s) => s.id)).toEqual(['/srv/blog\0blog'])
  })

  it('merges and de-duplicates config files across the containers of a project', () => {
    const services = buildServices(
      [
        container({ id: '1', labels: composeLabels('app', '/srv/app', '/srv/app/a.yaml,/srv/app/b.yaml') }),
        container({ id: '2', labels: composeLabels('app', '/srv/app', '/srv/app/b.yaml') })
      ],
      []
    )

    expect(services[0]?.configFiles).toEqual(['/srv/app/a.yaml', '/srv/app/b.yaml'])
  })
})

describe('buildServices — containers with invalid labels (spec §10 P2)', () => {
  it('keeps the project visible and flags it when one of its containers has unsafe labels', () => {
    const services = buildServices(
      [
        container({ id: 'ok', labels: composeLabels('app', '/srv/app') }),
        container({ id: 'bad', labels: composeLabels('app', '/srv/app', 'compose.yaml') })
      ],
      []
    )

    expect(services).toHaveLength(1)
    expect(services[0]).toMatchObject({ id: '/srv/app\0app', invalidReason: 'config file is not an absolute path: "compose.yaml"' })
    expect(services[0]?.containers.map((c) => c.id)).toEqual(['ok', 'bad'])
  })

  it('lists a project whose labels are all unsafe under its raw labels, with no project name to act on', () => {
    const [service] = buildServices([container({ labels: composeLabels('app', 'srv/app') })], [])

    expect(service).toMatchObject({
      id: 'srv/app\0app',
      projectName: null,
      workingDir: 'srv/app',
      displayName: 'app',
      invalidReason: 'working dir is not an absolute path: "srv/app"'
    })
  })

  it('still reserves the project name of an invalid project, so a pin elsewhere cannot take it over', () => {
    const services = buildServices(
      [
        container({ id: 'a', labels: composeLabels('app', '/srv/app') }),
        container({ id: 'b', labels: composeLabels('app', '/srv/app', 'x.yml') })
      ],
      [pin({ workingDir: '/other/app', project: 'app' })]
    )

    expect(services.find((s) => s.workingDir === '/other/app')?.conflictingDirs).toEqual(['/srv/app'])
    expect(services.find((s) => s.workingDir === '/srv/app')).toMatchObject({ invalidReason: expect.any(String) as string, conflictingDirs: [] })
  })

  it('marks valid services with no invalid reason', () => {
    expect(buildServices([container({ labels: composeLabels('app', '/srv/app') })], [])[0]?.invalidReason).toBeNull()
  })
})

describe('buildServices — real name of never-started pins (spec §10 P1)', () => {
  it('uses the name Compose resolves from the compose file, not the dir name', () => {
    const services = buildServices(
      [container({ labels: composeLabels('sonarqube', DEV_INFRA) })],
      [pin({ workingDir: STACK })],
      new Map([[STACK, 'sonarqube']])
    )

    expect(services.find((s) => s.workingDir === STACK)?.conflictingDirs).toEqual([DEV_INFRA])
  })

  it('prefers the pin project over the resolved name', () => {
    const services = buildServices(
      [container({ labels: composeLabels('sonarqube', DEV_INFRA) })],
      [pin({ workingDir: STACK, project: 'sonar-two' })],
      new Map([[STACK, 'sonarqube']])
    )

    expect(services.find((s) => s.workingDir === STACK)?.conflictingDirs).toEqual([])
  })
})

describe('buildServices — pin file merge and ordering', () => {
  it('applies a dir-only pin to every project of that dir', () => {
    const services = buildServices(
      [container({ labels: composeLabels('sonarqube', STACK) })],
      [pin({ workingDir: STACK, name: 'SonarQube', url: 'http://localhost:9000' })]
    )

    expect(services).toHaveLength(1)
    expect(services[0]).toMatchObject({ id: `${STACK}\0sonarqube`, displayName: 'SonarQube', pin: { url: 'http://localhost:9000' } })
  })

  it('prefers a project-specific pin over a dir-only pin', () => {
    const services = buildServices(
      [container({ labels: composeLabels('qa2', '/srv/app') })],
      [pin({ workingDir: '/srv/app', name: 'Any' }), pin({ workingDir: '/srv/app', project: 'qa2', name: 'QA 2' })]
    )

    expect(services.map((s) => [s.id, s.displayName])).toEqual([['/srv/app\0qa2', 'QA 2']])
  })

  it('does not apply a pin narrowed to another project of the same dir', () => {
    const services = buildServices(
      [container({ labels: composeLabels('qa2', '/srv/app') })],
      [pin({ workingDir: '/srv/app', project: 'qa1', name: 'QA 1' })]
    )

    expect(services.map((s) => [s.id, s.displayName])).toEqual([
      ['/srv/app\0qa1', 'QA 1'],
      ['/srv/app\0qa2', 'qa2']
    ])
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

    expect(service).toMatchObject({ id: '/srv/app\0app-qa', projectName: 'app-qa', displayName: 'app-qa' })
  })

  it('flags a never-started pin whose project name already runs from another dir', () => {
    const services = buildServices(
      [container({ labels: composeLabels('foo', '/x') })],
      [pin({ workingDir: '/y', project: 'foo' })]
    )

    expect(services.find((s) => s.workingDir === '/y')?.conflictingDirs).toEqual(['/x'])
  })

  it('never blocks the running project because of a pin elsewhere', () => {
    const services = buildServices([container({ labels: composeLabels('x', '/b/x') })], [pin({ workingDir: '/a/x' })])

    expect(services.find((s) => s.workingDir === '/b/x')?.conflictingDirs).toEqual([])
    expect(services.find((s) => s.workingDir === '/a/x')?.conflictingDirs).toEqual(['/b/x'])
  })

  it('does not flag two never-started pins against each other while nothing runs', () => {
    const services = buildServices([], [pin({ workingDir: '/work/api' }), pin({ workingDir: '/perso/api' })])

    expect(services.map((s) => s.conflictingDirs)).toEqual([[], []])
  })

  it('flags a never-started pin whose dir name Compose would turn into a running project name', () => {
    const services = buildServices(
      [container({ labels: composeLabels('blog', '/srv/blog') })],
      [pin({ workingDir: '/home/u/Blog' })]
    )

    expect(services.find((s) => s.workingDir === '/home/u/Blog')?.conflictingDirs).toEqual(['/srv/blog'])
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

  it('orders ties deterministically, whatever the container list order', () => {
    const a = container({ id: '1', labels: composeLabels('qa2', '/srv/app') })
    const b = container({ id: '2', labels: composeLabels('qa1', '/srv/app') })
    const pins = [pin({ workingDir: '/srv/app', pinned: true })]

    expect(buildServices([a, b], pins).map((s) => s.id)).toEqual(buildServices([b, a], pins).map((s) => s.id))
  })
})
