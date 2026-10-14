import { describe, expect, it } from 'vitest'
import { composeLabels, container } from '../domain/test-fixtures'
import type { ControllerState, ServiceView } from '../../shared/ipc'
import { listBackground } from './background-monitor'
import { buildTrayMenu, type MenuEntry, type TrayActions } from './tray-menu'

function view(overrides: Partial<ServiceView> = {}): ServiceView {
  return {
    id: '/srv/blog\0blog',
    displayName: 'Blog',
    workingDir: '/srv/blog',
    status: 'off',
    controls: { start: true, stop: false },
    hasUrl: false,
    reason: null,
    ...overrides
  }
}

function state(overrides: Partial<ControllerState> = {}): ControllerState {
  return { dockerAvailable: true, dockerReason: null, pinErrors: [], services: [view()], ...overrides }
}

function recordingActions(): TrayActions & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    start: (id) => calls.push(`start ${id}`),
    stop: (id) => calls.push(`stop ${id}`),
    openUrl: (id) => calls.push(`open ${id}`),
    openDashboard: () => calls.push('dashboard'),
    quit: () => calls.push('quit')
  }
}

const labels = (entries: readonly MenuEntry[]): string[] => entries.map((entry) => entry.label ?? `<${entry.type ?? '?'}>`)

describe('buildTrayMenu — every action reachable from the menu (spec R5)', () => {
  it('lists each service with its status, then the dashboard and quit entries', () => {
    const menu = buildTrayMenu(state({ services: [view(), view({ id: 'b', displayName: 'SonarQube', status: 'on' })] }), recordingActions())

    expect(labels(menu)).toEqual(['🔴 Blog', '🟢 SonarQube', '<separator>', 'Open dashboard', 'Quit'])
  })

  it('offers only the controls the derived status allows, and the URL when there is one', () => {
    const actions = recordingActions()
    const [entry] = buildTrayMenu(state({ services: [view({ status: 'on', controls: { start: false, stop: true }, hasUrl: true })] }), actions)

    expect(entry?.submenu?.map((item) => [item.label, item.enabled])).toEqual([
      ['Start', false],
      ['Stop', true],
      ['Open in browser', true]
    ])
    entry?.submenu?.[1]?.click?.()
    entry?.submenu?.[2]?.click?.()
    expect(actions.calls).toEqual(['stop /srv/blog\0blog', 'open /srv/blog\0blog'])
  })

  it('shows the reason of a greyed row as a disabled line', () => {
    const [entry] = buildTrayMenu(state({ services: [view({ status: 'conflict', controls: { start: false, stop: false }, reason: 'project name also used by /x' })] }), recordingActions())

    expect(entry?.label).toBe('⚪ Blog')
    expect(entry?.submenu?.at(-1)).toEqual({ label: 'project name also used by /x', enabled: false })
  })

  it('replaces the service list by the outage while Docker is unavailable', () => {
    const menu = buildTrayMenu(state({ dockerAvailable: false, dockerReason: 'connect ENOENT /var/run/docker.sock' }), recordingActions())

    expect(labels(menu)).toEqual(['Docker unavailable: connect ENOENT /var/run/docker.sock', '<separator>', 'Open dashboard', 'Quit'])
    expect(menu[0]?.enabled).toBe(false)
  })

  it('says so when there is no service yet', () => {
    expect(labels(buildTrayMenu(state({ services: [] }), recordingActions()))[0]).toBe('No Compose project found')
  })
})

describe('listBackground — UC4', () => {
  it('lists every container with its Compose project, and the joined ports', async () => {
    const snapshot = [
      container({ name: 'sonarqube', image: 'sonarqube:community', health: 'healthy', labels: composeLabels('sonarqube', '/srv/sq'), publishedPorts: [{ hostIp: '0.0.0.0', hostPort: 9000, containerPort: 9000, protocol: 'tcp' }] }),
      container({ id: 'p', name: 'pyinstaller-test', image: 'alpine:3.20', state: 'exited', exitCode: 1 })
    ]

    const view = await listBackground(snapshot, () => Promise.resolve([{ address: '0.0.0.0', port: 9000 }]))

    expect(view).toEqual({
      containers: [
        { name: 'sonarqube', image: 'sonarqube:community', state: 'running', health: 'healthy', project: 'sonarqube' },
        { name: 'pyinstaller-test', image: 'alpine:3.20', state: 'exited', health: null, project: null }
      ],
      ports: [{ address: '0.0.0.0', port: 9000, owner: { kind: 'container', name: 'sonarqube' } }]
    })
  })

  it('still lists the containers when ss fails', async () => {
    const view = await listBackground([container()], () => Promise.reject(new Error('spawn ss ENOENT')))

    expect(view.containers).toHaveLength(1)
    expect(view.ports).toEqual([])
  })
})
