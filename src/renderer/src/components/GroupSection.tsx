import type { DockNRollApi, ServiceView } from '../../../shared/ipc'
import { groupSummary } from '../../../shared/groups'

type Props = {
  readonly name: string
  readonly members: readonly ServiceView[]
  readonly dockerAvailable: boolean
  readonly api: DockNRollApi
  /** The member rows, rendered by the caller (`ServiceRow`). */
  readonly children: React.ReactNode
}

/**
 * UC8 / UC9, #98 (groups diagram 03): one collapsible section per group, open by default — its
 * summary, Start all / Stop all, then its members. The main process re-checks every control.
 */
export function GroupSection({ name, members, dockerAvailable, api, children }: Props): React.JSX.Element {
  return (
    <details className="group" open>
      <summary className="group__summary">
        <span className="group__name">{name}</span>
        <span className="group__count">{groupSummary(members)}</span>
      </summary>
      <div className="group__actions">
        <button type="button" aria-label={`Start all ${name}`} disabled={!dockerAvailable} onClick={() => void api.startGroup(name)}>
          Start all
        </button>
        <button type="button" aria-label={`Stop all ${name}`} disabled={!dockerAvailable} onClick={() => void api.stopGroup(name)}>
          Stop all
        </button>
      </div>
      <ul className="services">{children}</ul>
    </details>
  )
}
