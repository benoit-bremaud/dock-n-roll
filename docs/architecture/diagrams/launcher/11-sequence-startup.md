# Sequence diagram — launcher — application startup

> **Source specs**: `docs/architecture/specs/v1-spec.md` §3
> **Related ADRs**: ADR-0001, ADR-0005, ADR-0006
> **Related issue**: #8 (window shown with no tray icon after a GNOME-menu launch)

## Context

What happens between the launch and the first full state. The first recomputation can wait on
`docker compose config` per pinned dir (15 s timeout + 5 s SIGKILL), so nothing user-facing may
depend on it: the tray exists before any slow step, and the state arrives by push.

## Diagram

```mermaid
sequenceDiagram
  actor U as User
  participant M as main (index.ts)
  participant T as Tray
  participant SC as ServiceController
  participant PF as PinFileStore
  participant W as Dashboard window

  U->>M: launch (GNOME menu or autostart)
  M->>M: requestSingleInstanceLock, wire second-instance to showDashboard
  M->>T: create with menu "Starting… / Quit"
  M->>SC: createServiceController(deps)
  SC->>PF: openPinFileStore
  PF-->>SC: store loaded
  SC->>SC: start first recomputation (not awaited)
  SC-->>M: controller
  alt Quit chosen while starting
    M->>SC: dispose, and stop there
  else
    M->>M: before-quit disposes the controller
    M->>SC: onChange(render tray, push to window)
    M->>M: registerIpc
    M->>W: push current state, if a window was opened early (second-instance)
    Note over M,W: a page still loading drops that push; its did-finish-load pushes again
    opt packaged build
      M->>M: await autostart state
    end
    M->>T: render menu from current state
  end
  SC-->>M: onChange(first full state)
  M->>T: render menu
  M->>W: push state
```

## Notes

- The dashboard may load before the controller exists: its `getState` then rejects, and
  `publish()` skips unchanged states. Two pushes close that gap: one right after `registerIpc`
  (page already loaded), one on `did-finish-load` once the controller exists (page still loading).
- "Quit" in the starting tray fires `before-quit` before the dispose listener exists: startup
  checks for it after the controller is created and disposes it itself.
- A startup failure still shows an error box and quits: otherwise the single-instance lock
  would block every relaunch.
