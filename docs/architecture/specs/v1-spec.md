# dock-n-roll — V1 specification

> **Status**: validated by the owner on 2026-10-09 (conception gate)
> **Diagrams**: `docs/architecture/diagrams/launcher/`
> **Decisions**: [ADR-0001](../decisions/0001-electron-typescript.md), [ADR-0002](../decisions/0002-compose-lifecycle-via-cli.md), [ADR-0003](../decisions/0003-service-discovery.md)

## 1. Need

As a developer on a single Ubuntu workstation, I run many local dev services (SonarQube,
per-project Compose stacks for QA). Starting/stopping them means remembering folders and
typing `docker compose` commands, and I lose track of what keeps running in the background.

I want a small desktop tool, always reachable from the GNOME top bar, that:

1. shows one button per service — **green = ON, red = OFF** — and toggles it in one click;
2. lists everything currently running in the background (containers, listening ports).

## 2. Scope

### In V1

- Control of **Docker Compose projects** (start / stop / status).
- **Auto-discovery** of Compose projects already known to the Docker Engine, plus a
  hand-edited YAML **pin file** to pin, rename, hide services and give them a URL.
- **Background monitor**: all containers (running + stopped) and all TCP listening ports,
  with the owning process or container.
- Open a service's URL in the default browser.
- Tray icon (AppIndicator) with a menu + a dashboard window.

### Out of V1 (backlog)

- Shell-command services (`npm run dev`, …) and `systemd --user` units.
- Live logs, profiles/groups ("QA mode"), cleanup of exited containers, CPU/RAM stats.
- Any UI for editing the pin file (it is edited by hand).
- Packaging for other users / other OSes.

## 3. Domain vocabulary

| Term | Definition |
|---|---|
| **Service** | One Docker Compose project, identified by the pair *(project name, working dir)* — never by the project name alone (see §6, R1). |
| **Pin file** | `~/.config/dock-n-roll/services.yaml` — owner-edited overrides keyed by working dir. |
| **Health source** | Where "ready" comes from, in priority order: Docker `HEALTHCHECK` status → `healthUrl` from the pin file (HTTP 2xx/3xx) → container `running`. |
| **Listening port** | A TCP socket in `LISTEN` state on the host, from `ss -ltnp` joined with Docker port bindings. |

## 4. Service status (aggregated over the project's containers)

| Status | Colour | Rule |
|---|---|---|
| `off` | red | all containers stopped |
| `starting` | orange | start requested, or ≥ 1 container `health=starting`, until all ready |
| `on` | green | all containers running and ready per their health source |
| `stopping` | orange | stop requested, until all containers stopped |
| `partial` | orange | some running, some stopped, no operation in flight |
| `missing` | grey | working dir or compose file no longer exists — start disabled |
| `conflict` | grey | same project name seen with ≥ 2 working dirs — controls disabled, both listed |

If the Docker daemon is unreachable, the dashboard shows an app-level banner and all
services are displayed as unknown; no per-service status is invented.

## 5. Use cases (Cockburn, brief)

Primary actor for all: **Developer**. Supporting actor: **Docker Engine**.

### UC1 — Start a service

- **Precondition**: service status is `off` or `partial`; Docker reachable.
- **Main success scenario**:
  1. Developer clicks the red button (dashboard) or the menu item (tray).
  2. System marks the service `starting`.
  3. System runs `docker compose -p <name> -f <config files> up -d` in the working dir.
  4. System follows container events until every container is ready.
  5. System marks the service `on` (green).
- **Extensions**:
  - 3a. Command exits non-zero → status recomputed from real state (`off`/`partial`), error message shown with stderr excerpt.
  - 4a. Not ready after the start timeout (default 180 s, SonarQube is slow) → status `partial`, warning shown.
  - \*a. Status is `missing` or `conflict` → button disabled with tooltip explaining why.

### UC2 — Stop a service

- **Precondition**: status `on`, `starting` or `partial`.
- **Main success scenario**: click green button → `stopping` → `docker compose -p <name> stop` → all stopped → `off`.
- **Note**: `stop`, never `down` — `down` removes containers, which would erase the Compose labels auto-discovery relies on (ADR-0003) and make the service disappear.
- **Extensions**: 3a. command fails → same as UC1-3a.

### UC3 — Consult services status

- Developer opens the tray menu or the dashboard; system lists services (pinned first, then
  discovered, hidden excluded) with their live status. Status refreshes on Docker events,
  no polling of the Docker API.

### UC4 — Inspect background activity

- Developer opens the "Running" tab; system lists:
  - containers (name, image, status, uptime, Compose project if any, published ports);
  - listening TCP ports (address:port, process name + PID when visible, else the container
    publishing it, else "unknown (root process)").
- Read-only in V1.

### UC5 — Open a service in the browser

- Precondition: the service has a `url` in the pin file.
- Developer clicks the link icon → system opens the URL in the default browser.

## 6. Risks and constraints (from the brainstorm, verified on the workstation 2026-10-09)

- **R1 — Project-name collision** (observed): containers `sonarqube` and `sonar-db` both carry
  project `sonarqube` but come from `02_personal/sonarqube-stack` and
  `02_personal/dev-infra/sonarqube`. → identity = *(name, working dir)*; status `conflict`.
- **R2 — Stale working dir**: a moved/deleted project folder → status `missing`, never a crash.
- **R3 — Root-owned ports**: `ss` (unprivileged) cannot see the process behind Docker-published
  ports → join with Docker port bindings; never ask for sudo.
- **R4 — Docker socket = root-equivalent**: the app stays local-only: no HTTP server, no
  remote input; commands are spawned with `execFile` and an argument array (no shell), only
  with values read from Docker labels / the pin file.
- **R5 — Tray click on Linux**: StatusNotifierItem does not guarantee which click activates
  the icon (Electron `Tray` docs) → all actions are reachable through the tray **menu**.

## 7. Acceptance criteria (V1)

- [ ] AC1 — The tray icon appears in the GNOME top bar at login (autostart entry).
- [ ] AC2 — Every Compose project known to Docker appears without any configuration.
- [ ] AC3 — Clicking a red service starts it; it goes orange then green once healthy.
- [ ] AC4 — Clicking a green service stops it; its containers still exist afterwards (`docker ps -a`).
- [ ] AC5 — A service started/stopped from a terminal updates in the UI within 2 s.
- [ ] AC6 — Pinned services appear first, with their custom name; hidden ones do not appear.
- [ ] AC7 — The collision of R1 is displayed as `conflict` with both working dirs.
- [ ] AC8 — A project whose folder was deleted is displayed as `missing`.
- [ ] AC9 — The "Running" tab lists every listening TCP port, including Docker-published ones.
- [ ] AC10 — With the Docker daemon stopped, the app shows a banner and does not crash.

## 8. Pin file — format sketch

```yaml
services:
  - workingDir: /home/vev/Documents/02_personal/sonarqube-stack
    name: SonarQube
    url: http://localhost:9000
    healthUrl: http://localhost:9000/api/system/status
    pinned: true
  - workingDir: /home/vev/Documents/Codex/bulle-de-je
    hidden: true
```

## 9. Resolved questions (owner, 2026-10-09)

- Q1 — Pin file reload: **watched automatically**; an invalid YAML keeps the last valid
  config and shows a warning (never a crash).
- Q2 — Containers not part of any Compose project (e.g. `pyinstaller-test`): **monitor only**,
  never exposed as services.
