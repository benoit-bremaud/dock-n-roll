# Deployment diagram — launcher — installed app on the workstation

> **Source specs**: `docs/architecture/specs/v1-spec.md` AC1, §2
> **Related ADRs**: ADR-0001, ADR-0006, ADR-0010

## Context

Where the packaged app lives and what it touches at runtime once installed from the `.deb`.

## Diagram

```mermaid
flowchart LR
  subgraph Workstation ["Ubuntu 24.04 workstation"]
    subgraph Opt ["/opt/dock-n-roll (from the .deb)"]
      Exe["dock-n-roll executable (Electron fuses set)"]
      Asar["resources/app.asar — out/main, out/preload, out/renderer"]
      Icon["resources/tray-icon.png (extraResources)"]
    end
    AppArmor[/"/etc/apparmor.d/dock-n-roll (from the .deb) — allows user namespaces"/]
    subgraph Home ["~ (per user)"]
      Autostart[/"~/.config/autostart/dock-n-roll.desktop"/]
      Pins[/"~/.config/dock-n-roll/services.yaml"/]
    end
    Session(("GNOME session login"))
    Docker[("Docker Engine — /var/run/docker.sock")]
    CLI[["docker compose CLI"]]
  end
  Session -->|"XDG autostart"| Autostart
  Autostart -->|"Exec"| Exe
  AppArmor -.->|"Chromium sandbox"| Exe
  Exe --> Asar
  Exe --> Icon
  Exe --> Pins
  Exe --> Docker
  Exe --> CLI
```

## Notes

- The autostart entry is written by the app ("Start at login" in the tray menu), never by the
  package: it is a per-user choice.
- Packaged builds resolve the tray icon from `process.resourcesPath`; the preload script is read
  from inside `app.asar`, which the sandboxed renderer supports.

## CI smoke deployment (ADR-0010)

The CI `package` job runs the same unpacked build before uploading the `.deb`.

```mermaid
flowchart LR
  subgraph Runner ["ubuntu-latest runner — package job"]
    Xvfb(("xvfb-run (virtual X display)"))
    subgraph Unpacked ["dist/linux-unpacked"]
      Exe1["dock-n-roll #1 --remote-debugging-port"]
      Exe2["dock-n-roll #2 (second instance)"]
    end
    Scratch[/"scratch XDG_CONFIG_HOME (mkdtemp)"/]
    Smoke[["e2e/smoke.mjs — playwright-core connectOverCDP"]]
    NoDocker[("Docker: may be absent — app shows 'Docker unavailable'")]
  end
  Xvfb --> Exe1
  Smoke -->|"spawn"| Exe1
  Smoke -->|"spawn: opens the dashboard"| Exe2
  Exe2 -.->|"single-instance lock: second-instance"| Exe1
  Smoke -->|"CDP over 127.0.0.1"| Exe1
  Exe1 --> Scratch
  Exe1 -.-> NoDocker
```

- The smoke tests the hardened binary as shipped: the Node inspect fuse stays off, only the
  Chromium `--remote-debugging-port` switch is used, and only on the CI runner.
