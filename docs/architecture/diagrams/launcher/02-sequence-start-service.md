# Sequence diagram — launcher — start a service

> **Source specs**: `docs/architecture/specs/v1-spec.md` §3, §4, §5 UC1
> **Related ADRs**: ADR-0002, ADR-0003

## Context

The only non-trivial flow of V1: it crosses the renderer, the main process, the Compose CLI
and the Docker Engine, while Docker events keep arriving. Stop (UC2) is the same shape with
`stop`, no `--file` and no health gate, and is not drawn.

## Diagram

```mermaid
sequenceDiagram
  actor Dev as Developer
  participant UI as Dashboard (renderer)
  participant SC as ServiceController
  participant CR as ComposeRunner
  participant CLI as docker compose CLI
  participant DE as Docker Engine
  participant DO as DockerObserver
  participant HP as HealthProbe

  Dev->>UI: Click red button "SonarQube"
  UI->>SC: ipc start(serviceId)
  SC->>SC: guard pending is null and status in off or partial
  SC->>SC: pending = start
  SC-->>UI: push statusChanged starting (orange)
  SC->>CR: up(name, workingDir, files)
  CR->>CLI: execFile compose --project-name=n --file=f up -d --wait --wait-timeout 180
  CLI->>DE: create or start containers, wait running or healthy
  par events while the command runs
    DE-->>DO: event start or health_status
    DO-->>SC: containerChanged(id, state, health)
    SC-->>UI: push statusChanged (still starting while pending)
  end
  CLI-->>CR: exit code + stderr
  alt exit code != 0
    CR-->>SC: failure(stderr excerpt)
    SC->>SC: pending = null, derive status from real state
    SC-->>UI: push statusChanged off or partial + error message
  else exit code 0
    CR-->>SC: ok
    SC->>SC: pending = null, derive status
    opt healthUrl set and no container has a HEALTHCHECK
      loop every 2 s until HTTP 2xx or 3xx
        SC->>HP: probe(healthUrl)
        HP-->>SC: http status
      end
    end
    SC-->>UI: push statusChanged on (green)
  end
```

## Notes

- `execFile` with an argument array in `--flag=value` form — no shell, no flag injection
  (spec R4). A pinned service with no container yet runs without `--project-name` / `--file`.
- Readiness of containers is delegated to `compose up --wait`. The events channel is still
  what makes services started from a terminal update the UI (AC5).
- The guard is on `pending`, not on the displayed status, so a double-click or an event-driven
  `partial` cannot spawn a second `up`.
- The `healthUrl` gate is not specific to this flow: it also applies to a service started
  from a terminal (spec §3).
