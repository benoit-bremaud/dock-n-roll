# Sequence diagram — groups — start a group

> **Source specs**: issue #77
> **Related diagrams**: `../launcher/02-sequence-start-service.md` (one member's start)

## Context

UC8 from the tray or the dashboard. Stop (UC9) is the same shape with `stop` and the stop
guard, and is not drawn.

## Diagram

```mermaid
sequenceDiagram
  actor Dev as Developer
  participant UI as Tray or Dashboard
  participant SC as ServiceController
  participant CR as ComposeRunner

  Dev->>UI: Choose "Start group QA"
  UI->>SC: ipc startGroup("QA")
  SC->>SC: members = services whose groups contain "QA" and controls.start
  par each member, in parallel
    SC->>SC: run(member.id, start) — same guard and pending as UC1
    SC->>CR: up(member)
    CR-->>SC: ok or failure(stderr)
    SC-->>UI: push statusChanged for that row (error on that row only)
  end
  SC-->>UI: startGroup resolves once every member settled
```

## Notes

- No new state: the group action is a fan-out of the existing `run`, so the pending guard,
  health gate and error reporting stay per service (`Promise.allSettled`).
- Members already on or pending are skipped by the `controls.start` filter, so starting a
  half-running group only starts what is missing.
- Order is not guaranteed; ordering inside a project stays Compose's `depends_on`.
