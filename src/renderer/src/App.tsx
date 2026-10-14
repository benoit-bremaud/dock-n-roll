import { useRef, useState, type KeyboardEvent } from 'react'
import type { DockNRollApi } from '../../shared/ipc'
import { Banners } from './components/Banners'
import { RunningTab } from './components/RunningTab'
import { ServiceRow } from './components/ServiceRow'
import { useControllerState } from './useControllerState'

const TABS = [
  { key: 'services', label: 'Services' },
  { key: 'running', label: 'Running' }
] as const

type Tab = (typeof TABS)[number]['key']

/** Dashboard window (component diagram 09): renders what the main process pushes, sends ids back. */
export function App({ api }: { readonly api: DockNRollApi }): React.JSX.Element {
  const { state, error } = useControllerState(api)
  const [tab, setTab] = useState<Tab>('services')
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  // WAI-ARIA tabs pattern: one tab stop, arrow keys / Home / End move and select.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = TABS.findIndex((candidate) => candidate.key === tab)
    const next = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: TABS.length - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    const index = (next + TABS.length) % TABS.length
    const target = TABS[index]
    if (target === undefined) return
    setTab(target.key)
    tabRefs.current[index]?.focus()
  }

  return (
    <main className="app">
      <h1 className="app__title">dock-n-roll</h1>
      <div role="tablist" aria-label="Views" className="tabs" onKeyDown={onKeyDown}>
        {TABS.map((candidate, index) => (
          <button
            key={candidate.key}
            ref={(element) => {
              tabRefs.current[index] = element
            }}
            type="button"
            role="tab"
            id={`tab-${candidate.key}`}
            aria-controls={`panel-${candidate.key}`}
            aria-selected={tab === candidate.key}
            tabIndex={tab === candidate.key ? 0 : -1}
            onClick={() => {
              setTab(candidate.key)
            }}
          >
            {candidate.label}
          </button>
        ))}
      </div>
      <Banners state={state} error={error} />
      <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'running' ? (
          <RunningTab api={api} />
        ) : state === null ? null : state.services.length === 0 ? (
          <p className="app__empty">No Compose project found.</p>
        ) : (
          <ul className="services">
            {state.services.map((service) => (
              <ServiceRow key={service.id} service={service} api={api} dockerAvailable={state.dockerAvailable} />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

/** Entry point: a missing preload API (wrong path in a packaged build) is explained, not a blank window. */
export function Root({ api }: { readonly api: DockNRollApi | undefined }): React.JSX.Element {
  if (api === undefined) {
    return (
      <main className="app">
        <p role="alert" className="banner">
          dock-n-roll could not connect to its main process (preload API missing).
        </p>
      </main>
    )
  }
  return <App api={api} />
}
