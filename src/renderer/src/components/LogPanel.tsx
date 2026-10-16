import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DockNRollApi, LogsState } from '../../../shared/ipc'

/** How close to the bottom (px) still counts as "following": new lines then scroll into view. */
const FOLLOW_SLACK_PX = 24

/**
 * UC7 (diagram 14): the logs of one service, under its row. Subscribes before opening (the state
 * only comes as a push), closes on unmount. Lines are React text in a `<pre>`, never HTML; the
 * main process already removed escape sequences.
 */
export function LogPanel({
  api,
  serviceId,
  name
}: {
  readonly api: Pick<DockNRollApi, 'openLogs' | 'closeLogs' | 'onLogsChanged'>
  readonly serviceId: string
  readonly name: string
}): React.JSX.Element {
  const [logs, setLogs] = useState<LogsState | null>(null)
  const pre = useRef<HTMLPreElement>(null)
  const following = useRef(true)

  useEffect(() => {
    const unsubscribe = api.onLogsChanged((next) => {
      // Another panel's state, or the `null` of a close, is not this panel's.
      if (next?.serviceId === serviceId) setLogs(next)
    })
    void api.openLogs(serviceId, null)
    return () => {
      unsubscribe()
      void api.closeLogs()
    }
  }, [api, serviceId])

  // Stays at the bottom unless the developer scrolled up to read.
  useLayoutEffect(() => {
    const element = pre.current
    if (element !== null && following.current) element.scrollTop = element.scrollHeight
  }, [logs])

  const reopen = (containerId: string | null): void => {
    void api.openLogs(serviceId, containerId)
  }

  return (
    <div className="logs">
      <div className="logs__bar">
        {logs !== null && logs.containers.length > 1 && (
          <label>
            Container{' '}
            <select value={logs.containerId ?? ''} onChange={(event) => { reopen(event.target.value) }}>
              {logs.containers.map((container) => (
                <option key={container.id} value={container.id}>
                  {container.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {logs?.ended != null && <span className="logs__ended">{logs.ended}</span>}
        {logs?.ended != null && logs.containerId !== null && (
          <button type="button" onClick={() => { reopen(logs.containerId) }}>
            Reopen
          </button>
        )}
      </div>
      <pre
        ref={pre}
        className="logs__lines"
        aria-label={`Log lines of ${name}`}
        onScroll={(event) => {
          const element = event.currentTarget
          following.current = element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOW_SLACK_PX
        }}
      >
        {logs?.lines.join('\n')}
      </pre>
    </div>
  )
}
