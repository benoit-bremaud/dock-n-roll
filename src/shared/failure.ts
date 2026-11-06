// How a failed command is named (#85), shared by the tray, the dashboard rows and the announcer.
import type { CommandFailure } from './ipc'

const LABELS: Readonly<Record<CommandFailure['operation'], string>> = { start: 'Start failed', stop: 'Stop failed', restart: 'Restart failed' }

/** "Start failed", "Stop failed" or "Restart failed". */
export function failedLabel(failure: CommandFailure): string {
  return LABELS[failure.operation]
}

/** The line that says why: the runner puts its cause last, Compose its error last. */
export function lastLine(failure: CommandFailure): string {
  return failure.message.split('\n').at(-1) ?? ''
}
