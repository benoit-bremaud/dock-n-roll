import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { BackgroundView, ControllerState, DockNRollApi, ServiceView } from '../../shared/ipc'
import { App } from './App'

function view(overrides: Partial<ServiceView> = {}): ServiceView {
  return {
    id: 'blog-id',
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

/** Stand-in for the preload API (a boundary already tested in the main process). */
function fakeApi(initial: ControllerState, background: BackgroundView = { containers: [], ports: [] }) {
  const calls: string[] = []
  let listener: ((next: ControllerState) => void) | undefined
  let unsubscribed = false
  const api: DockNRollApi = {
    getState: () => {
      calls.push(listener === undefined ? 'getState before subscribe' : 'getState')
      return Promise.resolve(initial)
    },
    start: (id) => {
      calls.push(`start ${id}`)
      return Promise.resolve()
    },
    stop: (id) => {
      calls.push(`stop ${id}`)
      return Promise.resolve()
    },
    openUrl: (id) => {
      calls.push(`open ${id}`)
      return Promise.resolve()
    },
    listBackground: () => {
      calls.push('listBackground')
      return Promise.resolve(background)
    },
    onStateChanged: (callback) => {
      listener = callback
      return () => {
        unsubscribed = true
      }
    }
  }
  return {
    api,
    calls,
    push: (next: ControllerState) => {
      act(() => listener?.(next))
    },
    get unsubscribed() {
      return unsubscribed
    }
  }
}

afterEach(() => {
  cleanup()
})

describe('App — services tab (spec §4, UC1–UC3, UC5)', () => {
  it('subscribes before reading the initial state, then lists the services', async () => {
    const fake = fakeApi(state({ services: [view(), view({ id: 'sq', displayName: 'SonarQube', status: 'on' })] }))
    render(<App api={fake.api} />)

    expect(await screen.findByText('Blog')).toBeTruthy()
    expect(screen.getByText('SonarQube')).toBeTruthy()
    expect(fake.calls[0]).toBe('getState')
  })

  it('shows the status as a word next to the colour badge', async () => {
    render(<App api={fakeApi(state({ services: [view({ status: 'starting' })] })).api} />)

    const row = await screen.findByRole('listitem', { name: 'Blog' })
    expect(within(row).getByText('starting')).toBeTruthy()
    expect(row.querySelector('[data-status="starting"]')).not.toBeNull()
  })

  it('offers exactly the allowed controls, labelled with the service name, and sends the id', async () => {
    const fake = fakeApi(state({ services: [view({ status: 'on', controls: { start: false, stop: true }, hasUrl: true })] }))
    render(<App api={fake.api} />)
    const user = userEvent.setup()

    const start = await screen.findByRole('button', { name: 'Start Blog' })
    expect((start as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Stop Blog' }))
    await user.click(screen.getByRole('button', { name: 'Open Blog in the browser' }))

    expect(fake.calls).toContain('stop blog-id')
    expect(fake.calls).toContain('open blog-id')
  })

  it('has no Open button when the pin has no URL', async () => {
    render(<App api={fakeApi(state()).api} />)

    await screen.findByText('Blog')
    expect(screen.queryByRole('button', { name: /Open Blog/ })).toBeNull()
  })

  it('shows the reason of a greyed row', async () => {
    render(<App api={fakeApi(state({ services: [view({ status: 'conflict', controls: { start: false, stop: false }, reason: 'project name also used by /x' })] })).api} />)

    expect(await screen.findByText('project name also used by /x')).toBeTruthy()
  })

  it('follows every pushed state', async () => {
    const fake = fakeApi(state())
    render(<App api={fake.api} />)
    await screen.findByText('Blog')

    fake.push(state({ services: [view({ status: 'on' })] }))

    expect(within(screen.getByRole('listitem', { name: 'Blog' })).getByText('on')).toBeTruthy()
  })

  it('renders text from Docker and the pin file as text, never as HTML', async () => {
    render(<App api={fakeApi(state({ services: [view({ displayName: '<img src=x onerror=alert(1)>' })] })).api} />)

    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeTruthy()
    expect(document.querySelector('img')).toBeNull()
  })

  it('says so when there is no service', async () => {
    render(<App api={fakeApi(state({ services: [] })).api} />)

    expect(await screen.findByText('No Compose project found.')).toBeTruthy()
  })

  it('unsubscribes when it goes away', async () => {
    const fake = fakeApi(state())
    const { unmount } = render(<App api={fake.api} />)
    await screen.findByText('Blog')

    unmount()

    expect(fake.unsubscribed).toBe(true)
  })
})

describe('App — banners (spec §4, §9 Q1)', () => {
  it('announces Docker being unavailable', async () => {
    render(<App api={fakeApi(state({ dockerAvailable: false, dockerReason: 'connect ENOENT /var/run/docker.sock' })).api} />)

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((alert) => alert.textContent)).toEqual(['Docker unavailable: connect ENOENT /var/run/docker.sock'])
  })

  it('announces pin-file errors', async () => {
    render(<App api={fakeApi(state({ pinErrors: ['services.yaml: bad indentation at line 3'] })).api} />)

    expect((await screen.findByRole('alert')).textContent).toBe('services.yaml: bad indentation at line 3')
  })

  it('shows no banner when all is well', async () => {
    render(<App api={fakeApi(state()).api} />)

    await screen.findByText('Blog')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('App — running tab (UC4)', () => {
  it('loads containers and ports when opened, and again on refresh', async () => {
    const fake = fakeApi(state(), {
      containers: [{ name: 'sonarqube', image: 'sonarqube:community', state: 'running', health: 'healthy', project: 'sonarqube' }],
      ports: [{ address: '0.0.0.0', port: 9000, owner: { kind: 'container', name: 'sonarqube' } }]
    })
    render(<App api={fake.api} />)
    const user = userEvent.setup()
    await screen.findByText('Blog')

    await user.click(screen.getByRole('tab', { name: 'Running' }))
    expect(await screen.findByText('sonarqube:community')).toBeTruthy()
    expect(screen.getByText('9000')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(fake.calls.filter((call) => call === 'listBackground')).toHaveLength(2)
  })

  it('does not scan before the tab is opened', async () => {
    const fake = fakeApi(state())
    render(<App api={fake.api} />)
    await screen.findByText('Blog')

    expect(fake.calls).not.toContain('listBackground')
  })
})
