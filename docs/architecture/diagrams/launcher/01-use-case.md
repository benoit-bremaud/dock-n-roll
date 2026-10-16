# Use case diagram — launcher — V1 goals of the developer

> **Source specs**: `docs/architecture/specs/v1-spec.md` §5
> **Related ADRs**: ADR-0002, ADR-0003

## Context

Who interacts with dock-n-roll V1, and to do what. Textual specs of each use case (steps,
extensions) live in the spec §5. Does not show where things run (see `03-component.md`).

## Diagram

```mermaid
flowchart LR
  Developer((Developer))
  DockerEngine((Docker Engine))
  subgraph SYSTEM ["dock-n-roll"]
    subgraph Control ["Service control"]
      UC1(("UC1 Start a service"))
      UC2(("UC2 Stop a service"))
      UC6(("UC6 Restart a service"))
      UC5(("UC5 Open a service in the browser"))
    end
    subgraph Observe ["Observation"]
      UC3(("UC3 Consult services status"))
      UC4(("UC4 Inspect background activity"))
    end
  end
  Developer --> UC1
  Developer --> UC2
  Developer --> UC3
  Developer --> UC4
  Developer --> UC5
  Developer --> UC6
  UC1 --- DockerEngine
  UC2 --- DockerEngine
  UC3 --- DockerEngine
  UC4 --- DockerEngine
  UC6 --- DockerEngine
```

## Notes

- Docker Engine is a **supporting** actor (secondary, linked without arrowhead): it never
  initiates a goal.
- "Being told a service became healthy" is not a use case — it is the success outcome of UC1.
- Editing the pin file is done by hand outside the app in V1 — not a use case of the system.
- UC6 (v1.1) restarts a running service so edits to its Compose file or `.env` apply: a
  stop then an `up`, see `12-sequence-restart-service.md`.
- Backlog goals (view logs, start a profile, clean exited containers) are deliberately absent.
