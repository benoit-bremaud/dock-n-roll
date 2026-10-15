# Deployment diagram — launcher — installed app on the workstation

> **Source specs**: `docs/architecture/specs/v1-spec.md` AC1, §2
> **Related ADRs**: ADR-0001, ADR-0006

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
