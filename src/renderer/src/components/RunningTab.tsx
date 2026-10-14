import { useCallback, useEffect, useState } from 'react'
import type { BackgroundView, DockNRollApi } from '../../../shared/ipc'

function ownerOf(owner: BackgroundView['ports'][number]['owner']): string {
  if (owner.kind === 'process') return `${owner.name} (pid ${String(owner.pid)})`
  if (owner.kind === 'container') return owner.name
  return 'unknown (root process)'
}

/** UC4: containers and listening ports, loaded when the tab opens and on Refresh — no polling. */
export function RunningTab({ api }: { readonly api: DockNRollApi }): React.JSX.Element {
  const [view, setView] = useState<BackgroundView | null>(null)
  const refresh = useCallback(() => {
    void api.listBackground().then(setView)
  }, [api])
  useEffect(refresh, [refresh])

  return (
    <section className="running" aria-label="Running">
      <button type="button" onClick={refresh}>
        Refresh
      </button>
      <h2>Containers</h2>
      <table>
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
      <h2>Listening ports</h2>
      <table>
        <thead>
          <tr><th>Port</th><th>Address</th><th>Owner</th></tr>
        </thead>
        <tbody>
          {view?.ports.map((port) => (
            <tr key={`${port.address}:${String(port.port)}`}>
              <td>{port.port}</td><td>{port.address}</td><td>{ownerOf(port.owner)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
