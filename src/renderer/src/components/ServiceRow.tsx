import type { CommandFailure, DockNRollApi, ServiceView } from '../../../shared/ipc'
import { failedLabel } from '../../../shared/failure'
import { shortenPath, shortenReason } from '../format'
import { LogPanel } from './LogPanel'

/** #44: long paths cut in the middle; the full reason is the tooltip and what screen readers read. */
function Reason({ reason, homeDir }: { readonly reason: string; readonly homeDir: string }): React.JSX.Element {
  const shown = shortenReason(reason, homeDir)
  if (shown === reason) return <span className="service__reason">{reason}</span>
  return (
    <span className="service__reason">
      <span title={reason} aria-hidden="true">
        {shown}
      </span>
      <span className="visually-hidden">{reason}</span>
    </span>
  )
}

/** #85: what failed and the last Compose lines; the dashboard's `FailureAnnouncer` says it aloud. */
function Failure({ failure }: { readonly failure: CommandFailure }): React.JSX.Element {
  return (
    <p className="service__failure">
      <strong>{failedLabel(failure)}:</strong> {failure.message}
    </p>
  )
}

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
  homeDir,
  logsOpen,
  onToggleLogs,
  section
}: {
  readonly service: ServiceView
  readonly api: DockNRollApi
  readonly dockerAvailable: boolean
  readonly homeDir: string
  /** UC7: this row's logs panel is the open one. */
  readonly logsOpen: boolean
  readonly onToggleLogs: () => void
  /** The group section listing this row (#98): a service of two groups gets distinct button names. */
  readonly section?: string | undefined
}): React.JSX.Element {
  const name = service.displayName
  const target = section === undefined ? name : `${name}, in ${section}`
  return (
    <li className={dockerAvailable ? 'service' : 'service service--greyed'}>
      {dockerAvailable ? <span className="service__badge" data-status={service.status} aria-hidden="true" /> : <span className="service__badge" aria-hidden="true" />}
      <div className="service__main">
        <span className="service__name">{name}</span>
        {dockerAvailable && <span className="service__status">{service.status}</span>}
        <span className="service__dir" title={service.workingDir}>
          {shortenPath(service.workingDir, homeDir)}
        </span>
        {service.reason !== null && <Reason reason={service.reason} homeDir={homeDir} />}
        {service.failure !== null && <Failure failure={service.failure} />}
      </div>
      <div className="service__actions">
        <button type="button" className="button--primary" aria-label={`Start ${target}`} disabled={!service.controls.start} onClick={() => void api.start(service.id)}>
          Start
        </button>
        <button type="button" aria-label={`Stop ${target}`} disabled={!service.controls.stop} onClick={() => void api.stop(service.id)}>
          Stop
        </button>
        <button type="button" aria-label={`Restart ${target}`} disabled={!service.controls.restart} onClick={() => void api.restart(service.id)}>
          Restart
        </button>
        <button type="button" aria-label={`Logs of ${target}`} aria-expanded={logsOpen} disabled={!dockerAvailable && !logsOpen} onClick={onToggleLogs}>
          Logs
        </button>
        {service.hasUrl && (
          <button type="button" aria-label={`Open ${target} in the browser`} onClick={() => void api.openUrl(service.id)}>
            Open ↗
          </button>
        )}
      </div>
      {logsOpen && <LogPanel api={api} serviceId={service.id} name={name} />}
    </li>
  )
}
