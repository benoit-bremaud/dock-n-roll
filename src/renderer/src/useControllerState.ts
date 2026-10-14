import { useEffect, useState } from 'react'
import type { ControllerState, DockNRollApi } from '../../shared/ipc'

/**
 * Latest controller state. Subscribes before reading the initial state (contract of
 * `DockNRollApi`), so no push between the two is missed; a push always wins over the initial
 * read. `null` until the first state arrives.
 */
export function useControllerState(api: DockNRollApi): ControllerState | null {
  const [state, setState] = useState<ControllerState | null>(null)
  useEffect(() => {
    let pushed = false
    const unsubscribe = api.onStateChanged((next) => {
      pushed = true
      setState(next)
    })
    void api.getState().then((initial) => {
      if (!pushed) setState(initial)
    })
    return unsubscribe
  }, [api])
  return state
}
