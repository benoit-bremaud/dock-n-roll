# Component diagram — launcher — V1 structure

> **Source specs**: `docs/architecture/specs/v1-spec.md` §3, §4, §6, §10
> **Related ADRs**: ADR-0001, ADR-0002, ADR-0003, ADR-0005

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
    subgraph Adapters ["adapters (IO, src/main/adapters)"]
      DO["DockerObserver (node:http, unix socket)"]
      CR["ComposeRunner (execFile docker compose)"]
      HP["HealthProbe (fetch)"]
      FP["FileProbe (fs.stat)"]
      PS["PortScanner (execFile ss)"]
      PF["PinFileStore (yaml + dir watch)"]
    end
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
  SC --> FP
  SC --> PF
  BM --> PS
  BM --> DO
  DO -->|"/var/run/docker.sock"| Docker[("Docker Engine API")]
  CR -->|"spawn, no shell, COMPOSE_* removed, DOCKER_HOST pinned"| CLI[["docker compose CLI"]]
  PS -->|"spawn, no shell"| SS[["ss -ltnpH"]]
  HP -->|"HTTP GET"| Local[["service healthUrl"]]
  FP -->|"stat"| Disk[/"working dirs and compose files"/]
  PF -->|"read + watch dir"| YAML[/"~/.config/dock-n-roll/services.yaml"/]
  SC -->|"shell.openExternal http or https"| Browser[["default browser"]]
  Tray -->|"StatusNotifierItem"| GNOME[["GNOME top bar"]]
  Autostart[/"~/.config/autostart/dock-n-roll.desktop"/] -.->|"launches at login"| Main
```

## Notes

- Dependency rule: `domain` imports nothing from Electron, Node IO or adapters — it is the
  unit-tested core. Adapters import domain **types** and pure mapping helpers only; the
  domain never imports an adapter (enforced by lint).
- Each adapter is a few functions over one OS boundary, written against its real interface
  (socket, child process, file system, HTTP). Their pure parts — mapping a Docker inspect to a
  `ContainerSnapshot`, parsing `ss` output, removing `COMPOSE_*` variables — live beside them
  and are unit-tested; the IO parts are integration-tested against stand-ins of the
  boundary (a fake Docker HTTP server on a temporary socket, a fake `docker` executable,
  temporary directories, a local HTTP server).
- `ComposeRunner` also resolves the real project name of a never-started pin with
  `docker compose --project-directory=<dir> config --format=json`, run in the project dir with
  remote includes disabled (spec §10 P1, ADR-0002).
- `PinFileStore` watches the **directory**, not the file: editors save by writing a new file
  and renaming it, which a file watch misses.
- The preload script runs in the renderer process, in an isolated context
  (`contextIsolation`, `sandbox`, no Node in the page). It exposes a narrow API:
  `listServices`, `start`, `stop`, `openUrl`, `listBackground`, `onStatusChanged`.
- ServiceController owns the pending operations and guards only. UC4 (background activity)
  goes through BackgroundMonitor, not through ServiceController.
- The Docker socket is the only root-equivalent egress (spec R4); nothing listens on the network.
