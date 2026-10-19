import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { BackgroundView, ControllerState, DockNRollApi, ServiceView } from '../../shared/ipc'
import { App, Root } from './App'

function view(overrides: Partial<ServiceView> = {}): ServiceView {
  return {
    id: 'blog-id',
    displayName: 'Blog',
    workingDir: '/srv/blog',
    status: 'off',
    controls: { start: true, stop: false, restart: false },
    hasUrl: false,
    reason: null,
    ...overrides
  }
}

function state(overrides: Partial<ControllerState> = {}): ControllerState {
  return { dockerAvailable: true, dockerReason: null, pinErrors: [], services: [view()], homeDir: '/home/u', ...overrides }
}

/** Stand-in for the preload API (a boundary already tested in the main process). */
function fakeApi(initial: ControllerState, backgrounds: (BackgroundView | Error)[] = [{ containers: [], ports: [] }]) {
  const calls: string[] = []
  let listener: ((next: ControllerState) => void) | undefined
  let unsubscribed = false
  let scans = 0
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
    restart: (id) => {
      calls.push(`restart ${id}`)
      return Promise.resolve()
    },
    openUrl: (id) => {
      calls.push(`open ${id}`)
      return Promise.resolve()
    },
    listBackground: () => {
      calls.push('listBackground')
      const next = backgrounds[Math.min(scans, backgrounds.length - 1)]
      scans += 1
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next ?? null)
    },
    onStateChanged: (callback) => {
      listener = callback
      return () => {
        unsubscribed = true
      }
    },
    openLogs: (serviceId) => {
      calls.push(`openLogs ${serviceId}`)
      return Promise.resolve()
    },
    closeLogs: () => {
      calls.push('closeLogs')
      return Promise.resolve()
    },
    onLogsChanged: () => () => undefined
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

/** The list item holding a service, found by its visible name. */
async function rowOf(name: string): Promise<HTMLElement> {
  const item = (await screen.findByText(name)).closest('li')
  if (item === null) throw new Error(`no row for ${name}`)
  return item
}

const button = (name: string): HTMLButtonElement => screen.getByRole('button', { name })

afterEach(() => {
  cleanup()
})

describe('App — header and paths (diagram 09)', () => {
  it('summarises how many services are on', async () => {
    render(<App api={fakeApi(state({ services: [view(), view({ id: 'sq', displayName: 'SonarQube', status: 'on' })] })).api} />)

    expect(await screen.findByText('1 of 2 on')).toBeTruthy()
  })

  it('hides the summary while Docker is unavailable, as the statuses may be wrong', async () => {
    render(<App api={fakeApi(state({ dockerAvailable: false, dockerReason: 'down' })).api} />)

    await rowOf('Blog')
    expect(screen.queryByText(/ of \d+ on$/)).toBeNull()
  })

  it('shows the working dir with the home folder as ~, the full path as a tooltip', async () => {
    render(<App api={fakeApi(state({ services: [view({ workingDir: '/home/u/Documents/blog' })] })).api} />)

    const dir = within(await rowOf('Blog')).getByText('~/Documents/blog')
    expect(dir.getAttribute('title')).toBe('/home/u/Documents/blog')
  })

  it('cuts a long path in the reason, the full reason as a tooltip (#44)', async () => {
    const reason = 'compose file /home/u/Documents/clients/acme/projects/2026/backend/compose.yaml is missing'
    render(<App api={fakeApi(state({ services: [view({ status: 'missing', reason })] })).api} />)

    const row = await rowOf('Blog')
    const shown = within(row).getByText('compose file ~/Documents/cli…026/backend/compose.yaml is missing')
    expect(shown.getAttribute('title')).toBe(reason)
    // Screen readers get the full reason, not the cut one.
    expect(shown.getAttribute('aria-hidden')).toBe('true')
    expect(within(row).getByText(reason).className).toBe('visually-hidden')
  })

  it('has no tooltip on a reason short enough to show whole', async () => {
    render(<App api={fakeApi(state({ services: [view({ status: 'missing', reason: 'folder /srv/x is missing' })] })).api} />)

    const shown = within(await rowOf('Blog')).getByText('folder /srv/x is missing')
    expect([shown.getAttribute('title'), shown.getAttribute('aria-hidden')]).toEqual([null, null])
  })
})

describe('App — services tab (spec §4, UC1–UC3, UC5)', () => {
  it('subscribes before reading the initial state, then lists the services', async () => {
    const fake = fakeApi(state({ services: [view(), view({ id: 'sq', displayName: 'SonarQube', status: 'on' })] }))
    render(<App api={fake.api} />)

    await rowOf('Blog')
    await rowOf('SonarQube')
    expect(fake.calls[0]).toBe('getState')
  })

  it('keeps a pushed state when the initial read resolves late', async () => {
    let resolve: (value: ControllerState) => void = () => undefined
    const fake = fakeApi(state())
    fake.api.getState = () =>
      new Promise((done) => {
        resolve = done
      })
    render(<App api={fake.api} />)

    fake.push(state({ services: [view({ status: 'on' })] }))
    await act(async () => {
      resolve(state({ services: [view({ status: 'off' })] }))
      await Promise.resolve()
    })

    expect(within(await rowOf('Blog')).getByText('on')).toBeTruthy()
  })

  it('says so when the state cannot be read', async () => {
    const fake = fakeApi(state())
    fake.api.getState = () => Promise.reject(new Error('IPC closed'))
    render(<App api={fake.api} />)

    expect((await screen.findByRole('alert')).textContent).toBe('Could not read the state: IPC closed')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the status as a word next to the colour badge', async () => {
    render(<App api={fakeApi(state({ services: [view({ status: 'starting' })] })).api} />)

    const row = await rowOf('Blog')
    expect(within(row).getByText('starting')).toBeTruthy()
    expect(row.querySelector('[data-status="starting"]')).not.toBeNull()
  })

  it('offers Start only when allowed, and sends the id', async () => {
    const fake = fakeApi(state({ services: [view({ controls: { start: true, stop: false, restart: false } })] }))
    render(<App api={fake.api} />)
    await rowOf('Blog')

    expect(button('Stop Blog').disabled).toBe(true)
    expect(button('Restart Blog').disabled).toBe(true)
    await userEvent.setup().click(button('Start Blog'))

    expect(fake.calls).toContain('start blog-id')
  })

  it('offers Stop and Open only when allowed, and sends the id', async () => {
    const fake = fakeApi(state({ services: [view({ status: 'on', controls: { start: false, stop: true, restart: true }, hasUrl: true })] }))
    render(<App api={fake.api} />)
    const user = userEvent.setup()
    await rowOf('Blog')

    expect(button('Start Blog').disabled).toBe(true)
    await user.click(button('Stop Blog'))
    await user.click(button('Restart Blog'))
    await user.click(button('Open Blog in the browser'))

    expect(fake.calls).toEqual(expect.arrayContaining(['stop blog-id', 'restart blog-id', 'open blog-id']))
  })

  it('has no Open button when the pin has no URL', async () => {
    render(<App api={fakeApi(state()).api} />)

    await rowOf('Blog')
    expect(screen.queryByRole('button', { name: /Open Blog/ })).toBeNull()
  })

  it('shows the reason of a greyed row, with both controls disabled', async () => {
    render(<App api={fakeApi(state({ services: [view({ status: 'conflict', controls: { start: false, stop: false, restart: false }, reason: 'project name also used by /x' })] })).api} />)

    expect(within(await rowOf('Blog')).getByText('project name also used by /x')).toBeTruthy()
    expect([button('Start Blog').disabled, button('Stop Blog').disabled, button('Restart Blog').disabled]).toEqual([true, true, true])
  })

  it('greys rows without badge or status while Docker is unavailable (spec §4)', async () => {
    render(<App api={fakeApi(state({ dockerAvailable: false, services: [view({ status: 'on', controls: { start: false, stop: false, restart: false } })] })).api} />)

    const row = await rowOf('Blog')
    expect(row.querySelector('[data-status]')).toBeNull()
    expect(within(row).queryByText('on')).toBeNull()
    expect(row.className).toContain('service--greyed')
  })

  it('follows every pushed state', async () => {
    const fake = fakeApi(state())
    render(<App api={fake.api} />)
    await rowOf('Blog')

    fake.push(state({ services: [view({ status: 'on' })] }))

    expect(within(await rowOf('Blog')).getByText('on')).toBeTruthy()
  })

  it('renders text from Docker and the pin file as text, never as HTML', async () => {
    render(<App api={fakeApi(state({ services: [view({ displayName: '<img src=x onerror=alert(1)>' })] })).api} />)

    await rowOf('<img src=x onerror=alert(1)>')
    expect(document.querySelector('img')).toBeNull()
  })

  it('says so when there is no service', async () => {
    render(<App api={fakeApi(state({ services: [] })).api} />)

    expect(await screen.findByText('No Compose project found.')).toBeTruthy()
  })

  it('unsubscribes when it goes away', async () => {
    const fake = fakeApi(state())
    const { unmount } = render(<App api={fake.api} />)
    await rowOf('Blog')

    unmount()

    expect(fake.unsubscribed).toBe(true)
  })
})

describe('App — loading (#14)', () => {
  it('says it is loading until the first state arrives', () => {
    const { api } = fakeApi(state({ services: [view()] }))
    render(<App api={{ ...api, getState: () => new Promise(() => undefined) }} />)

    expect(screen.getByRole('status').textContent).toBe('Loading…')
  })

  it('drops the loading notice once the state arrives', async () => {
    render(<App api={fakeApi(state({ services: [view()] })).api} />)

    await rowOf('Blog')
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('App — banners (spec §4, §9 Q1)', () => {
  const bannerTexts = async (): Promise<string[]> =>
    [...(await screen.findByRole('alert')).querySelectorAll('p')].map((p) => p.textContent)

  it('lists the Docker outage and every pin-file error in one alert region', async () => {
    render(<App api={fakeApi(state({ dockerAvailable: false, dockerReason: 'connect ENOENT', pinErrors: ['a', 'a'] })).api} />)

    expect(await bannerTexts()).toEqual(['Docker unavailable: connect ENOENT', 'a', 'a'])
  })

  it('names the outage without a reason when there is none', async () => {
    render(<App api={fakeApi(state({ dockerAvailable: false })).api} />)

    expect(await bannerTexts()).toEqual(['Docker unavailable'])
  })

  it('keeps one alert region across pushes, so it is not announced again for nothing', async () => {
    const fake = fakeApi(state({ pinErrors: ['bad line 3'] }))
    render(<App api={fake.api} />)
    const region = await screen.findByRole('alert')

    fake.push(state({ pinErrors: ['bad line 3'], services: [view({ status: 'on' })] }))

    expect(screen.getByRole('alert')).toBe(region)
  })

  it('has empty alerts when all is well', async () => {
    render(<App api={fakeApi(state()).api} />)

    await rowOf('Blog')
    expect(screen.getByRole('alert').textContent).toBe('')
  })
})

describe('App — tabs (WAI-ARIA tabs pattern)', () => {
  it('links each tab to its panel and switches back and forth', async () => {
    render(<App api={fakeApi(state()).api} />)
    const user = userEvent.setup()
    await rowOf('Blog')

    const services = screen.getByRole('tab', { name: 'Services' })
    expect(services.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel', { name: 'Services' })).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'Running' }))
    expect(screen.getByRole('tabpanel', { name: 'Running' })).toBeTruthy()
    await user.click(services)
    expect(await rowOf('Blog')).toBeTruthy()
  })

  it('moves between tabs with the arrow keys, one tab stop only', async () => {
    render(<App api={fakeApi(state()).api} />)
    const user = userEvent.setup()
    await rowOf('Blog')

    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1])
    tabs[0]?.focus()
    await user.keyboard('{ArrowRight}')

    expect(document.activeElement).toBe(tabs[1])
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true')
  })
})

describe('App — running tab (UC4)', () => {
  const background: BackgroundView = {
    containers: [
      { name: 'sonarqube', image: 'sonarqube:community', state: 'running', health: 'healthy', project: 'sonarqube' },
      { name: 'pyinstaller-test', image: 'alpine:3.20', state: 'exited', health: null, project: null }
    ],
    ports: [
      { address: '0.0.0.0', port: 9000, owner: { kind: 'container', name: 'sonarqube' } },
      { address: '127.0.0.1', port: 4321, owner: { kind: 'process', name: 'node', pid: 42 } },
      { address: '127.0.0.53', port: 53, owner: { kind: 'unknown' } }
    ]
  }

  it('shows containers with health, project and fallbacks, and every kind of port owner', async () => {
    render(<App api={fakeApi(state(), [background]).api} />)
    await rowOf('Blog')

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Running' }))

    const sonar = (await screen.findByText('sonarqube:community')).closest('tr')
    expect(screen.getByRole('table', { name: 'Containers' }).querySelector('caption')?.textContent).toBe('Every container on this machine, running or stopped.')
    expect(screen.getByRole('table', { name: 'Listening ports' }).querySelector('caption')?.textContent).toBe('TCP ports listening on this machine, and what owns them.')
    expect(sonar?.textContent).toBe('sonarqubesonarqube:communityrunninghealthysonarqube')
    expect(screen.getByText('pyinstaller-test').closest('tr')?.textContent).toBe('pyinstaller-testalpine:3.20exited——')
    expect(screen.getByText('node (pid 42)')).toBeTruthy()
    expect(screen.getByText('unknown (root process)')).toBeTruthy()
  })

  it('refreshes the view with the new result', async () => {
    const later: BackgroundView = { containers: [{ name: 'new-one', image: 'x', state: 'running', health: null, project: null }], ports: [] }
    render(<App api={fakeApi(state(), [background, later]).api} />)
    const user = userEvent.setup()
    await rowOf('Blog')
    await user.click(screen.getByRole('tab', { name: 'Running' }))
    await screen.findByText('sonarqube:community')

    await user.click(button('Refresh'))

    expect(await screen.findByText('new-one')).toBeTruthy()
    expect(screen.queryByText('sonarqube:community')).toBeNull()
  })

  it('says so when the scan fails, and when nothing runs', async () => {
    render(<App api={fakeApi(state(), [new Error('spawn ss ENOENT'), { containers: [], ports: [] }]).api} />)
    const user = userEvent.setup()
    await rowOf('Blog')

    await user.click(screen.getByRole('tab', { name: 'Running' }))
    expect(await screen.findByText('Could not scan: spawn ss ENOENT')).toBeTruthy()

    await user.click(button('Refresh'))
    expect(await screen.findByText('No container.')).toBeTruthy()
    expect(screen.getByText('No listening port.')).toBeTruthy()
  })

  it('does not scan before the tab is opened', async () => {
    const fake = fakeApi(state())
    render(<App api={fake.api} />)
    await rowOf('Blog')

    expect(fake.calls).not.toContain('listBackground')
  })
})

describe('Root — preload API missing (packaging risk)', () => {
  it('explains instead of showing a blank window', () => {
    render(<Root api={undefined} />)

    expect(screen.getByRole('alert').textContent).toBe('dock-n-roll could not connect to its main process (preload API missing).')
  })
})

describe('App — logs panel (UC7, diagram 09)', () => {
  it('opens one logs panel at a time, and closes it on a second click', async () => {
    const fake = fakeApi(state({ services: [view(), view({ id: 'sq', displayName: 'SonarQube', status: 'on' })] }))
    render(<App api={fake.api} />)
    await rowOf('Blog')

    await userEvent.click(button('Logs of Blog'))
    expect(screen.getByLabelText('Log lines of Blog')).toBeTruthy()
    expect(button('Logs of Blog').getAttribute('aria-expanded')).toBe('true')

    await userEvent.click(button('Logs of SonarQube'))
    expect(screen.queryByLabelText('Log lines of Blog')).toBeNull()
    expect(screen.getByLabelText('Log lines of SonarQube')).toBeTruthy()

    await userEvent.click(button('Logs of SonarQube'))
    expect(screen.queryByLabelText('Log lines of SonarQube')).toBeNull()
    expect(fake.calls.filter((call) => /^(openLogs|closeLogs)/.test(call))).toEqual(['openLogs blog-id', 'closeLogs', 'openLogs sq', 'closeLogs'])
  })

  it('disables Logs while Docker is unavailable', async () => {
    render(<App api={fakeApi(state({ dockerAvailable: false, dockerReason: 'down' })).api} />)
    await rowOf('Blog')

    expect(button('Logs of Blog').disabled).toBe(true)
  })
})
