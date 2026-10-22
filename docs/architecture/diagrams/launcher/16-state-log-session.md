# State diagram — launcher — logs panel across restarts

> **Source specs**: `docs/architecture/specs/v1-spec.md` §5 UC7 (v1.1)
> **Related**: diagram 14 (sequence), ADR-0008, issue #33

## Context

`LogSession` (main process) follows the logs of one container of one service. Until now a
stream that ended (Stop, Restart, crash) stayed ended until the developer clicked Reopen. This
diagram adds what happens when the service's containers change while the panel is open: the
container picker is refreshed, and a container that runs again is followed without a click.

## Diagram

```mermaid
stateDiagram-v2
  [*] --> Following: open(service) — a container is picked
  [*] --> Waiting: open(service) — no container yet
  [*] --> Unlisted: open(service) — not listed

  Following --> Waiting: stream ends (container stopped, daemon dropped)
  Following --> Following: containers changed — picker list refreshed
  Waiting --> Following: containers changed — a container of the service runs
  Waiting --> Waiting: containers changed — none runs (picker refreshed)
  Waiting --> Unlisted: service no longer listed
  Following --> Unlisted: service no longer listed

  Following --> [*]: close() / another panel opens / dashboard hidden
  Waiting --> [*]: close() / another panel opens / dashboard hidden
  Unlisted --> [*]: close()
```

## Notes

- **Trigger**: the session is refreshed after every controller recomputation (`onRecompute`),
  published or not: container ids and states are not in the published state, so a restart
  caught by one snapshot changes nothing there. It reads only the open service's containers.
- **Which container on resume**: the one followed before if it runs again (Restart keeps the
  id), else the first running container of the service (an `up` after Stop may recreate it).
- **Lines are kept** across the resume and a marker line separates the runs (no marker when
  the panel had no container yet):
  `— container restarted —`. The same container (Restart keeps its id, and its old log) is
  asked with `since=<time its last text arrived (or the stream started)>`, so at most a few
  lines around the reconnect are lost or repeated (host clock against daemon clock: #63). A recreated container (new id) has a fresh log and is
  asked with `tail=500` as usual.
- **Waiting shows the reason** (`ended`) with Reopen, as before; Reopen still works and is
  simply no longer needed for a restart.
- **Explicit close wins**: after `close()` nothing resumes. A container picked by hand stays
  the one followed when it runs again.
- **Picker refresh**: the `containers` list is replaced and pushed when its ids or names
  change, so a recreated container appears without reopening the panel.
- **No loop**: the followed container is resumed only after it was seen not running (a snapshot
  shows it stopped, or its stream ended cleanly: the daemon closes it on stop); a stream
  that failed while its container still runs stays in Waiting (Reopen). A container still listed
  (a stopped one picked by hand) is waited for, never swapped for another running one.
