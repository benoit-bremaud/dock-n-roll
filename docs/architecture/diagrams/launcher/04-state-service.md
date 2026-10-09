# State machine diagram — launcher — service status

> **Source specs**: `docs/architecture/specs/v1-spec.md` §4
> **Related ADRs**: ADR-0003

## Context

Lifecycle of the aggregated status of one service (Compose project). Colours: `on` green,
`off` red, transitional and `partial` orange, `missing` / `conflict` grey.

## Diagram

```mermaid
stateDiagram-v2
  [*] --> Off: discovered, all stopped
  [*] --> On: discovered, all ready
  [*] --> Partial: discovered, mixed
  [*] --> Missing: working dir gone
  [*] --> Conflict: name shared by 2+ working dirs

  Off --> Starting: start requested
  Partial --> Starting: start requested
  Starting --> On: all containers ready
  Starting --> Partial: timeout or some failed
  Starting --> Off: up command failed

  On --> Stopping: stop requested
  Partial --> Stopping: stop requested
  Starting --> Stopping: stop requested
  Stopping --> Off: all stopped
  Stopping --> Partial: stop command failed

  On --> Partial: a container exited (external)
  Partial --> On: all ready (external)
  Partial --> Off: all stopped (external)
  On --> Off: stopped from terminal
  Off --> On: started from terminal

  Missing --> Off: folder restored
  Conflict --> Off: collision resolved
```

## Notes

- "external" transitions come from Docker events, not from the app — the state reflects
  reality, the app never assumes success.
- `Missing` and `Conflict` have no outgoing user-triggered transition: controls are disabled.
- Docker daemon unreachable is an **app-level** condition (banner), not a service state.
