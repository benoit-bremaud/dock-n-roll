# Sequence diagram — launcher — Docker sync at startup and on reconnect

> **Source specs**: `docs/architecture/specs/v1-spec.md` §5 UC3 (event stream contract), AC5, AC10
> **Related ADRs**: ADR-0002, ADR-0005

## Context

How DockerObserver keeps an exact container snapshot with no polling. One procedure, `sync`,
runs at startup and after every stream loss, so a change between the list and the
subscription is never lost (PR #1 review). Does not cover how the controller turns snapshots
into services (domain, `05-class-domain.md`).

## Diagram

```mermaid
sequenceDiagram
  participant SC as ServiceController
  participant DO as DockerObserver
  participant API as Docker Engine API (unix socket)

  SC->>DO: observeDocker(options, listener)
  loop sync — at startup, then after every stream loss
    DO->>API: GET /events filters type=container (stream)
    Note over DO: headers awaited 5 s at most (a hung daemon is a lost connection); the open stream has no deadline
    Note over DO: events are buffered, not applied yet
    DO->>API: GET /containers/json?all=1
    API-->>DO: container ids
    loop each container
      DO->>API: GET /containers/{id}/json
      API-->>DO: State, ExitCode, Health, Labels, Ports
    end
    DO->>DO: snapshot = inspected containers, then apply buffered events
    DO-->>SC: onSnapshot(all containers)
    loop while the stream is open
      API-->>DO: a container event that can change a status
      alt destroy
        DO->>DO: remove the container from the snapshot
      else other
        DO->>API: GET /containers/{id}/json
        API-->>DO: fresh state
      end
      opt a container left running, queue drained, or maxBatch (50) events since the last publish
        DO-->>SC: onSnapshot(all containers)
      end
    end
    API--xDO: stream ends or socket error
    DO-->>SC: onUnavailable(reason) — banner, rows greyed
    DO->>DO: wait 1 s doubling up to 30 s
  end
```

## Notes

- **Re-inspect instead of patching from event fields**: an event only says *that* a container
  changed; the inspect gives the full truth (exit code, health, labels) in one shape, the same
  as the initial list. Simpler and impossible to drift.
- **Buffered events applied after the list** are each turned into a re-inspect too, so their
  order versus the list does not matter.
- `onSnapshot` fires once per burst of events (a `compose up` fires dozens), at least every
  `maxBatch` events while a burst lasts. A container leaving `running` publishes at once, so a
  crash followed by a restart in the same burst is still seen (crash notification, health gate).
- `onSnapshot` always carries the whole snapshot (a few dozen containers): the domain
  derives everything from it (`buildServices`), no incremental bookkeeping.
- Backoff resets to 1 s after a successful sync.
