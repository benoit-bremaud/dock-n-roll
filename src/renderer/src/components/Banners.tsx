import type { ControllerState } from '../../../shared/ipc'

function dockerUnavailable(reason: string | null): string {
  return reason === null ? 'Docker unavailable' : `Docker unavailable: ${reason}`
}

/**
 * Docker outage and pin-file errors (spec §4, §9 Q1). One alert region stays mounted, so a
 * push that changes nothing here is not announced again by screen readers.
 */
export function Banners({ state, error }: { readonly state: ControllerState | null; readonly error: string | null }): React.JSX.Element {
  const messages = [
    ...(error === null ? [] : [error]),
    ...(state === null || state.dockerAvailable ? [] : [dockerUnavailable(state.dockerReason)]),
    ...(state?.pinErrors ?? [])
  ]
  return (
    <div role="alert" className="banners">
      {messages.map((message, index) => (
        // The same message can repeat: the index keeps keys unique; the list has no row state.
        <p key={`${String(index)}:${message}`} className="banner">
          {message}
        </p>
      ))}
    </div>
  )
}
