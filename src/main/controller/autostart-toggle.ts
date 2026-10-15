export interface AutostartToggle {
  enabled(): boolean
  /** Writes the opposite setting; a click while a write is in flight is ignored. */
  toggle(): Promise<void>
}

/**
 * State behind the "Start at login" checkbox (ADR-0006). The setting only changes once the
 * write succeeds; `onChange` runs after every click, so a checkbox GTK already flipped snaps
 * back on failure.
 */
export function createAutostartToggle(deps: {
  readonly initial: boolean
  readonly write: (enabled: boolean) => Promise<void>
  readonly onChange: () => void
  readonly onError: (error: unknown) => void
}): AutostartToggle {
  let enabled = deps.initial
  let busy = false
  return {
    enabled: () => enabled,
    toggle: async () => {
      if (!busy) {
        busy = true
        const next = !enabled
        try {
          await deps.write(next)
          enabled = next
        } catch (error: unknown) {
          deps.onError(error)
        } finally {
          busy = false
        }
      }
      deps.onChange()
    }
  }
}
