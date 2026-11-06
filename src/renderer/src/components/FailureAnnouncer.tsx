import { failedLabel, lastLine } from '../../../shared/failure'
import type { ServiceView } from '../../../shared/ipc'

/**
 * #85: the one polite region that announces failed commands, once per service even when the
 * service is listed under several groups or inside a collapsed one. Always mounted, so a failure
 * is announced when it lands; one line per failure, and only added lines are read.
 */
export function FailureAnnouncer({ services }: { readonly services: readonly ServiceView[] }): React.JSX.Element {
  return (
    <div role="status" aria-live="polite" aria-atomic="false" className="visually-hidden">
      {services.map((service) =>
        service.failure === null ? null : (
          <p key={`${service.id}\0${service.failure.operation}\0${service.failure.message}`}>
            {`${service.displayName}: ${failedLabel(service.failure)}: ${lastLine(service.failure)}`}
          </p>
        )
      )}
    </div>
  )
}
