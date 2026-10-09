# Component diagram — launcher — V1 structure

> **Source specs**: `docs/architecture/specs/v1-spec.md` §3, §4, §6
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
    Preload["preload (contextBridge)"]
    Dashboard --> Preload
  end
  subgraph Main ["Main process"]
    Tray["TrayMenu"]
    SC["ServiceController (pending ops, guards)"]
    BM["BackgroundMonitor"]
    subgraph Domain ["domain (pure, no IO)"]
      Derive["status derivation (precedence)"]
      Ident["identity + conflict detection"]
      Merge["pin-file merge + validation"]
      Join["port join (ss x Docker bindings)"]
    end
    DO["DockerObserver (dockerode events)"]
    CR["ComposeRunner (execFile)"]
    HP["HealthProbe (fetch)"]
    PS["PortScanner (ss -ltnp)"]
    PF["PinFileStore (yaml + watch)"]
  end
  Preload -->|"ipcRenderer.invoke"| SC
  Preload -->|"ipcRenderer.invoke listBackground"| BM
  SC -->|"statusChanged push"| Preload
  SC -->|"statusChanged"| Tray
  Tray --> SC
  SC --> Domain
  BM --> Join
  SC --> DO
  SC --> CR
  SC --> HP
  SC --> PF
  BM --> PS
  BM --> DO
  DO -->|"/var/run/docker.sock"| Docker[("Docker Engine")]
  CR -->|"spawn, no shell"| CLI[["docker compose CLI"]]
  PS -->|"spawn, no shell"| SS[["ss"]]
  HP -->|"HTTP GET"| Local[["service healthUrl"]]
  PF -->|"read"| YAML[/"~/.config/dock-n-roll/services.yaml"/]
  SC -->|"shell.openExternal http or https"| Browser[["default browser"]]
  Tray -->|"StatusNotifierItem"| GNOME[["GNOME top bar"]]
  Autostart[/"~/.config/autostart/dock-n-roll.desktop"/] -.->|"launches at login"| Main
```

## Notes

- Dependency rule: `domain` imports nothing from Electron, dockerode or Node IO — it is the
  unit-tested core (status precedence of spec §4, conflict rule of ADR-0003, pin validation
  of R4/R6, port join of R3).
- The preload script runs in the renderer process, in an isolated context
  (`contextIsolation`, `sandbox`, no Node in the page). It exposes a narrow API:
  `listServices`, `start`, `stop`, `openUrl`, `listBackground`, `onStatusChanged`.
- ServiceController owns the pending operations and guards only. UC4 (background activity)
  goes through BackgroundMonitor, not through ServiceController.
- The Docker socket is the only root-equivalent egress (spec R4); nothing listens on the network.
