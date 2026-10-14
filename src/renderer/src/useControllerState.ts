import { useEffect, useState } from 'react'
import type { ControllerState, DockNRollApi } from '../../shared/ipc'

export interface ControllerView {
  readonly state: ControllerState | null
  /** Set when the initial read fails; a later push still recovers the view. */
  readonly error: string | null
}

/**
 * Latest controller state. Subscribes before reading the initial state (contract of
 * `DockNRollApi`), and a push always wins over the initial read — also across the effect
 * re-run of StrictMode or an `api` change, where an abandoned read must not land late.
 */
export function useControllerState(api: DockNRollApi): ControllerView {
  const [view, setView] = useState<ControllerView>({ state: null, error: null })
  useEffect(() => {
    let active = true
    let pushed = false
    const unsubscribe = api.onStateChanged((next) => {
      pushed = true
      setView({ state: next, error: null })
    })
    api.getState().then(
      (initial) => {
        if (active && !pushed && initial !== null) setView({ state: initial, error: null })
      },
      (error: unknown) => {
        if (active && !pushed) setView({ state: null, error: `Could not read the state: ${error instanceof Error ? error.message : String(error)}` })
      }
    )
    return () => {
      active = false
      unsubscribe()
    }
  }, [api])
  return view
}
