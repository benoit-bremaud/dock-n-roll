import { describe, expect, it } from 'vitest'
import { createAutostartToggle } from './autostart-toggle'

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined
  const promise = new Promise<void>((ok) => {
    resolve = ok
  })
  return { promise, resolve }
}

function setup(initial: boolean, write: (enabled: boolean) => Promise<void>) {
  const events: string[] = []
  const toggle = createAutostartToggle({
    initial,
    write: (enabled) => {
      events.push(`write ${String(enabled)}`)
      return write(enabled)
    },
    onChange: () => events.push('render'),
    onError: (error) => events.push(`error ${error instanceof Error ? error.message : String(error)}`)
  })
  return { toggle, events }
}

describe('createAutostartToggle — "Start at login" checkbox', () => {
  it('writes the opposite setting, then re-renders with it', async () => {
    const { toggle, events } = setup(false, () => Promise.resolve())

    await toggle.toggle()

    expect(toggle.enabled()).toBe(true)
    expect(events).toEqual(['write true', 'render'])
  })

  it('keeps the old setting on failure, reports it and re-renders so the checkbox snaps back', async () => {
    const { toggle, events } = setup(true, () => Promise.reject(new Error('EACCES')))

    await toggle.toggle()

    expect(toggle.enabled()).toBe(true)
    expect(events).toEqual(['write false', 'error EACCES', 'render'])
  })

  it('ignores a click while a write is in flight, so two quick clicks cannot race', async () => {
    const pending = deferred()
    const { toggle, events } = setup(false, () => pending.promise)

    const first = toggle.toggle()
    await toggle.toggle()
    pending.resolve()
    await first

    expect(events).toEqual(['write true', 'render', 'render'])
    expect(toggle.enabled()).toBe(true)
  })

  it('accepts a new click once the previous write is done', async () => {
    const { toggle, events } = setup(false, () => Promise.resolve())

    await toggle.toggle()
    await toggle.toggle()

    expect(toggle.enabled()).toBe(false)
    expect(events).toEqual(['write true', 'render', 'write false', 'render'])
  })
})
