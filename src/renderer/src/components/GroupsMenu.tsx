import { useEffect, useRef } from 'react'
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
  const menu = useRef<HTMLDetailsElement>(null)

  // The open list covers the service rows: Escape or a click elsewhere closes it, like a menu.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const details = menu.current
      if (event.key !== 'Escape' || details?.open !== true) return
      details.open = false
      details.querySelector('summary')?.focus()
    }
    const onPointer = (event: PointerEvent): void => {
      const details = menu.current
      if (details?.open === true && !details.contains(event.target as Node)) details.open = false
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [])

  if (groups.length === 0) return null
  return (
    <details ref={menu} className="groups">
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
