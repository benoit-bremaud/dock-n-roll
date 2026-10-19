import { useRef, useState, type KeyboardEvent } from 'react'
import type { ControllerState, DockNRollApi } from '../../shared/ipc'
import { Banners } from './components/Banners'
import { RunningTab } from './components/RunningTab'
import { ServiceRow } from './components/ServiceRow'
import { runningSummary } from './format'
import { useControllerState } from './useControllerState'

const TABS = [
  { key: 'services', label: 'Services' },
  { key: 'running', label: 'Running' }
] as const

type Tab = (typeof TABS)[number]['key']

/** Services tab: a wait (nothing if the first read failed: the banner says it), an empty list, or one row per service. */
function ServicesPanel({
  state,
  error,
  api,
  logsFor,
  onToggleLogs
}: {
  readonly state: ControllerState | null
  readonly error: string | null
  readonly api: DockNRollApi
  readonly logsFor: string | null
  readonly onToggleLogs: (id: string) => void
}): React.ReactNode {
  // Before the first state: a short wait, said once to assistive tech. A read error is the banner.
  if (state === null) return error === null ? <output className="app__empty">Loading…</output> : null
  if (state.services.length === 0) return <p className="app__empty">No Compose project found.</p>
  return (
    <ul className="services">
      {state.services.map((service) => (
        <ServiceRow
          key={service.id}
          service={service}
          api={api}
          dockerAvailable={state.dockerAvailable}
          homeDir={state.homeDir}
          logsOpen={logsFor === service.id}
          onToggleLogs={() => {
            onToggleLogs(service.id)
          }}
        />
      ))}
    </ul>
  )
}

/** Dashboard window (component diagram 09): renders what the main process pushes, sends ids back. */
export function App({ api }: { readonly api: DockNRollApi }): React.JSX.Element {
  const { state, error } = useControllerState(api)
  const [tab, setTab] = useState<Tab>('services')
  // UC7: one logs panel at a time; opening another closes the first.
  const [logsFor, setLogsFor] = useState<string | null>(null)
  const summary = state?.dockerAvailable === true ? runningSummary(state.services.map((service) => service.status)) : null
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
      <header className="app__header">
        <h1 className="app__title">dock-n-roll</h1>
        {/* Hidden while Docker is down: the last known statuses may be wrong (spec §4). */}
        {summary !== null && <p className="app__summary">{summary}</p>}
      </header>
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
        {tab === 'running' ? <RunningTab api={api} /> : (
          <ServicesPanel
            state={state}
            error={error}
            api={api}
            logsFor={logsFor}
            onToggleLogs={(id) => {
              setLogsFor((open) => (open === id ? null : id))
            }}
          />
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
