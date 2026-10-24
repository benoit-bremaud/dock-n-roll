import type { DockNRollApi } from '../../../shared/ipc'

type Props = {
  readonly groups: readonly string[]
  readonly dockerAvailable: boolean
  readonly api: DockNRollApi
}

/**
 * UC8 / UC9 (groups diagram 01): one disclosure in the header, absent without a group, so the
 * group controls only show once asked for. The main process re-checks every member's controls.
 */
export function GroupsMenu({ groups, dockerAvailable, api }: Props): React.ReactNode {
  if (groups.length === 0) return null
  return (
    <details className="groups">
      <summary>Groups</summary>
      <ul className="groups__list">
        {groups.map((name) => (
          <li key={name} className="groups__item">
            <span className="groups__name">{name}</span>
            <button type="button" aria-label={`Start all ${name}`} disabled={!dockerAvailable} onClick={() => void api.startGroup(name)}>
              Start all
            </button>
            <button type="button" aria-label={`Stop all ${name}`} disabled={!dockerAvailable} onClick={() => void api.stopGroup(name)}>
              Stop all
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
