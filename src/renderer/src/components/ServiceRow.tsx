import type { DockNRollApi, ServiceView } from '../../../shared/ipc'
import { shortenPath } from '../format'

/**
 * One service. Buttons mirror the controls the controller derived (the main process re-checks
 * them); no optimistic state — the next pushed state is the feedback. The status is a word next
 * to the colour badge, so colour is never the only signal. While Docker is unavailable the row
 * is greyed without badge or status (spec §4): the last known status may be wrong.
 */
export function ServiceRow({
  service,
  api,
  dockerAvailable,
  homeDir
}: {
  readonly service: ServiceView
  readonly api: DockNRollApi
  readonly dockerAvailable: boolean
  readonly homeDir: string
}): React.JSX.Element {
  const name = service.displayName
  return (
    <li className={dockerAvailable ? 'service' : 'service service--greyed'}>
      {dockerAvailable ? <span className="service__badge" data-status={service.status} aria-hidden="true" /> : <span className="service__badge" aria-hidden="true" />}
      <div className="service__main">
        <span className="service__name">{name}</span>
        {dockerAvailable && <span className="service__status">{service.status}</span>}
        <span className="service__dir" title={service.workingDir}>
          {shortenPath(service.workingDir, homeDir)}
        </span>
        {service.reason !== null && <span className="service__reason">{service.reason}</span>}
      </div>
      <div className="service__actions">
        <button type="button" className="button--primary" aria-label={`Start ${name}`} disabled={!service.controls.start} onClick={() => void api.start(service.id)}>
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
