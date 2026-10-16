import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { DockNRollApi, LogsState } from '../../../shared/ipc'
import { LogPanel } from './LogPanel'

type LogsApi = Pick<DockNRollApi, 'openLogs' | 'closeLogs' | 'onLogsChanged'>

function fakeLogsApi() {
  const calls: string[] = []
  let listener: ((state: LogsState | null) => void) | undefined
  const api: LogsApi = {
    openLogs: (serviceId, containerId) => {
      calls.push(listener === undefined ? 'open before subscribe' : `open ${serviceId} ${String(containerId)}`)
      return Promise.resolve()
    },
    closeLogs: () => {
      calls.push('close')
      return Promise.resolve()
    },
    onLogsChanged: (callback) => {
      listener = callback
      return () => {
        calls.push('unsubscribe')
        listener = undefined
      }
    }
  }
  return {
    api,
    calls,
    push: (state: LogsState | null) => {
      act(() => listener?.(state))
    }
  }
}

function logs(overrides: Partial<LogsState> = {}): LogsState {
  return { serviceId: 'blog', containerId: 'w', containers: [{ id: 'w', name: 'blog-web-1' }], lines: [], ended: null, ...overrides }
}

afterEach(() => {
  cleanup()
})

describe('LogPanel — UC7, diagram 14', () => {
  it('subscribes, then opens the logs of its service', () => {
    const fake = fakeLogsApi()

    render(<LogPanel api={fake.api} serviceId="blog" name="Blog" />)

    expect(fake.calls).toEqual(['open blog null'])
  })

  it('shows the pushed lines as text, never as HTML', () => {
    const fake = fakeLogsApi()
    render(<LogPanel api={fake.api} serviceId="blog" name="Blog" />)

    fake.push(logs({ lines: ['<b>bold</b>', 'second'] }))

    const pre = screen.getByLabelText('Log lines of Blog')
    expect(pre.textContent).toBe('<b>bold</b>\nsecond')
    expect(pre.querySelector('b')).toBeNull()
  })

  it('ignores a push for another service and a null push', () => {
    const fake = fakeLogsApi()
    render(<LogPanel api={fake.api} serviceId="blog" name="Blog" />)
    fake.push(logs({ lines: ['mine'] }))

    fake.push(logs({ serviceId: 'api', lines: ['theirs'] }))
    fake.push(null)

    expect(screen.getByLabelText('Log lines of Blog').textContent).toBe('mine')
  })

  it('offers a container picker for a multi-container service', async () => {
    const fake = fakeLogsApi()
    render(<LogPanel api={fake.api} serviceId="blog" name="Blog" />)
    expect(screen.queryByRole('combobox')).toBeNull()

    fake.push(logs({ containers: [{ id: 'w', name: 'blog-web-1' }, { id: 'd', name: 'blog-db-1' }] }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Container' }), 'd')

    expect(fake.calls.at(-1)).toBe('open blog d')
  })

  it('says why the stream ended and reopens the same container', async () => {
    const fake = fakeLogsApi()
    render(<LogPanel api={fake.api} serviceId="blog" name="Blog" />)

    fake.push(logs({ ended: 'Log stream ended' }))
    expect(screen.getByText('Log stream ended')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }))

    expect(fake.calls.at(-1)).toBe('open blog w')
  })

  it('offers no Reopen when the service has no container yet', () => {
    const fake = fakeLogsApi()
    render(<LogPanel api={fake.api} serviceId="blog" name="Blog" />)

    fake.push(logs({ containerId: null, containers: [], ended: 'No container yet' }))

    expect(screen.getByText('No container yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull()
  })

  it('closes the stream and unsubscribes on unmount', () => {
    const fake = fakeLogsApi()
    const { unmount } = render(<LogPanel api={fake.api} serviceId="blog" name="Blog" />)

    unmount()

    expect(fake.calls.slice(-2)).toEqual(['unsubscribe', 'close'])
  })
})
