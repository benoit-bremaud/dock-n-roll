# Component diagram — launcher — V1 structure

> **Source specs**: `docs/architecture/specs/v1-spec.md` §3, §6
> **Related ADRs**: ADR-0001, ADR-0002, ADR-0003

## Context

Structural boundaries of the Electron app and its egress points to the OS. Layering is
deliberately flat (personal tool): one pure `domain` module, thin adapters, no ports/interfaces
layer until a second implementation exists (shell services are backlog).

## Diagram

```mermaid
flowchart LR
  subgraph Renderer ["Renderer process (sandboxed)"]
    Dashboard["Dashboard UI"]
  end
  subgraph Main ["Main process"]
    Preload["preload (contextBridge IPC)"]
    Tray["TrayMenu"]
    SC["ServiceController"]
    subgraph Domain ["domain (pure, no IO)"]
      Agg["status aggregation"]
      Ident["identity + conflict detection"]
      Merge["pin-file merge"]
    end
    DO["DockerObserver (dockerode)"]
    CR["ComposeRunner (execFile)"]
    PS["PortScanner (ss -ltnp)"]
    PF["PinFileStore (yaml + watch)"]
  end
  Dashboard --> Preload
  Preload --> SC
  Tray --> SC
  SC --> Domain
  SC --> DO
  SC --> CR
  SC --> PS
  SC --> PF
  DO -->|"/var/run/docker.sock"| Docker[("Docker Engine")]
  CR -->|"spawn, no shell"| CLI[["docker compose CLI"]]
  PS -->|"spawn, no shell"| SS[["ss"]]
  PF -->|"read"| YAML[/"~/.config/dock-n-roll/services.yaml"/]
  Tray -->|"StatusNotifierItem"| GNOME[["GNOME top bar"]]
```

## Notes

- Dependency rule: `domain` imports nothing from Electron, dockerode or Node IO — it is the
  unit-tested core (status table §4, conflict rule of ADR-0003).
- The renderer has no Node access (`contextIsolation`, `sandbox`); it only calls a narrow
  IPC API: `listServices`, `start`, `stop`, `openUrl`, `listBackground`.
- The Docker socket is the only root-equivalent egress (spec R4); nothing listens on the network.
