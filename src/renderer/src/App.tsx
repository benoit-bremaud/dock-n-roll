import { useState } from 'react'
import type { DockNRollApi } from '../../shared/ipc'
import { Banners } from './components/Banners'
import { RunningTab } from './components/RunningTab'
import { ServiceRow } from './components/ServiceRow'
import { useControllerState } from './useControllerState'

type Tab = 'services' | 'running'

/** Dashboard window (component diagram 09): renders what the main process pushes, sends ids back. */
export function App({ api }: { readonly api: DockNRollApi }): React.JSX.Element {
  const state = useControllerState(api)
  const [tab, setTab] = useState<Tab>('services')

  return (
    <main className="app">
      <h1 className="app__title">dock-n-roll</h1>
      <div role="tablist" className="tabs">
        <button type="button" role="tab" aria-selected={tab === 'services'} onClick={() => { setTab('services') }}>
          Services
        </button>
        <button type="button" role="tab" aria-selected={tab === 'running'} onClick={() => { setTab('running') }}>
          Running
        </button>
      </div>
      {state !== null && <Banners state={state} />}
      {tab === 'services' ? (
        state === null ? null : state.services.length === 0 ? (
          <p className="app__empty">No Compose project found.</p>
        ) : (
          <ul className="services">
            {state.services.map((service) => (
              <ServiceRow key={service.id} service={service} api={api} />
            ))}
          </ul>
        )
      ) : (
        <RunningTab api={api} />
      )}
    </main>
  )
}
