import type { DockNRollApi, ServiceView } from '../../../shared/ipc'

/**
 * One service. Buttons mirror the controls the controller derived (the main process re-checks
 * them); no optimistic state — the next pushed state is the feedback. The status is a word next
 * to the colour badge, so colour is never the only signal.
 */
export function ServiceRow({ service, api }: { readonly service: ServiceView; readonly api: DockNRollApi }): React.JSX.Element {
  const name = service.displayName
  return (
    <li className="service" aria-label={name}>
      <span className="service__badge" data-status={service.status} aria-hidden="true" />
      <div className="service__main">
        <span className="service__name">{name}</span>
        <span className="service__status">{service.status}</span>
        <span className="service__dir">{service.workingDir}</span>
        {service.reason !== null && <span className="service__reason">{service.reason}</span>}
      </div>
      <div className="service__actions">
        <button type="button" aria-label={`Start ${name}`} disabled={!service.controls.start} onClick={() => void api.start(service.id)}>
          Start
        </button>
        <button type="button" aria-label={`Stop ${name}`} disabled={!service.controls.stop} onClick={() => void api.stop(service.id)}>
          Stop
        </button>
        {service.hasUrl && (
          <button type="button" aria-label={`Open ${name} in the browser`} onClick={() => void api.openUrl(service.id)}>
            Open ↗
          </button>
        )}
      </div>
    </li>
  )
}
