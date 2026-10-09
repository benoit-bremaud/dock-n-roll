# Sequence diagram — launcher — start a service

> **Source specs**: `docs/architecture/specs/v1-spec.md` §5 UC1, §4
> **Related ADRs**: ADR-0002, ADR-0003

## Context

The only non-trivial flow of V1: it crosses the renderer, the main process, the Compose CLI
and the Docker Engine, and waits asynchronously for readiness. Stop (UC2) mirrors it without
the health wait and is not drawn.

## Diagram

```mermaid
sequenceDiagram
  actor Dev as Developer
  participant UI as Dashboard (renderer)
  participant SC as ServiceController
  participant CR as ComposeRunner
  participant CLI as docker compose CLI
  participant DO as DockerObserver
  participant DE as Docker Engine

  Dev->>UI: Click red button "SonarQube"
  UI->>SC: ipc start(serviceId)
  SC->>SC: guard status in off or partial
  SC-->>UI: status starting (orange)
  SC->>CR: up(name, workingDir, configFiles)
  CR->>CLI: execFile docker compose -p name -f file up -d
  CLI->>DE: create or start containers
  CLI-->>CR: exit code + stderr
  alt exit code != 0
    CR-->>SC: failure(stderr excerpt)
    SC->>SC: recompute status from real container state
    SC-->>UI: status off or partial + error message
  else exit code 0
    CR-->>SC: ok
    loop until all containers ready or 180 s timeout
      DE-->>DO: event container start or health_status
      DO-->>SC: containerChanged(id, state, health)
      SC->>SC: aggregate project status
    end
    opt healthUrl set and no Docker HEALTHCHECK
      SC->>SC: probe healthUrl (HTTP 2xx or 3xx)
    end
    SC-->>UI: status on (green) or partial on timeout
  end
```

## Notes

- `execFile` with an argument array — no shell, so no injection surface (spec R4).
- Readiness is driven by the Docker `/events` stream, not polling — the same path makes
  services started from a terminal update the UI (AC5).
- The guard prevents a double-click from spawning two `up` commands.
