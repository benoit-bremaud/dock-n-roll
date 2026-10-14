import type { ControllerState } from '../../../shared/ipc'

/** Docker outage and pin-file errors (spec §4, §9 Q1), announced to screen readers. */
export function Banners({ state }: { readonly state: ControllerState }): React.JSX.Element | null {
  const messages = [
    ...(state.dockerAvailable ? [] : [`Docker unavailable${state.dockerReason === null ? '' : `: ${state.dockerReason}`}`]),
    ...state.pinErrors
  ]
  if (messages.length === 0) return null
  return (
    <div className="banners">
      {messages.map((message) => (
        <p key={message} role="alert" className="banner">
          {message}
        </p>
      ))}
    </div>
  )
}
