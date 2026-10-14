import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackgroundView, DockNRollApi } from '../../../shared/ipc'

function ownerOf(owner: BackgroundView['ports'][number]['owner']): string {
  if (owner.kind === 'process') return `${owner.name} (pid ${String(owner.pid)})`
  if (owner.kind === 'container') return owner.name
  return 'unknown (root process)'
}

/**
 * UC4: containers and listening ports, loaded when the tab opens and on Refresh — no polling.
 * Each request has a ticket: an older answer arriving after a newer one is ignored.
 */
export function RunningTab({ api }: { readonly api: DockNRollApi }): React.JSX.Element {
  const [view, setView] = useState<BackgroundView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)

  const refresh = useCallback(() => {
    latest.current += 1
    const ticket = latest.current
    api.listBackground().then(
      (next) => {
        if (ticket !== latest.current) return
        setView(next)
        setError(next === null ? 'Could not scan: refused by the main process' : null)
      },
      (failure: unknown) => {
        if (ticket === latest.current) setError(`Could not scan: ${failure instanceof Error ? failure.message : String(failure)}`)
      }
    )
  }, [api])

  useEffect(() => {
    refresh()
    return () => {
      // An answer arriving after the tab closed must not be applied.
      latest.current += 1
    }
  }, [refresh])

  return (
    <>
      <button type="button" onClick={refresh}>
        Refresh
      </button>
      {error !== null && <p className="running__error">{error}</p>}
      <h2 id="running-containers">Containers</h2>
      {view !== null && view.containers.length === 0 ? (
        <p className="app__empty">No container.</p>
      ) : (
        <table aria-labelledby="running-containers">
          <thead>
            <tr><th>Name</th><th>Image</th><th>State</th><th>Health</th><th>Project</th></tr>
          </thead>
          <tbody>
            {view?.containers.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td><td>{row.image}</td><td>{row.state}</td><td>{row.health ?? '—'}</td><td>{row.project ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2 id="running-ports">Listening ports</h2>
      {view !== null && view.ports.length === 0 ? (
        <p className="app__empty">No listening port.</p>
      ) : (
        <table aria-labelledby="running-ports">
          <thead>
            <tr><th>Port</th><th>Address</th><th>Owner</th></tr>
          </thead>
          <tbody>
            {view?.ports.map((port, index) => (
              // Several sockets can share an address and port (SO_REUSEPORT): the index keeps keys unique.
              <tr key={`${String(index)}:${port.address}:${String(port.port)}`}>
                <td>{port.port}</td><td>{port.address}</td><td>{ownerOf(port.owner)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
