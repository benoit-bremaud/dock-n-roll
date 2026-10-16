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
- Live logs (done in v1.1, UC7), profiles/groups ("QA mode"), cleanup of exited containers, CPU/RAM stats.
- Any UI for editing the pin file (it is edited by hand).
- Packaging for other users / other OSes.

## 3. Domain vocabulary

| Term | Definition |
|---|---|
| **Service** | One Docker Compose project, identified by the pair *(project name, working dir)* — never by the project name alone (see §6, R1). A pinned project with no container yet is identified by its working dir (plus its pin `project`, if any) until its first container is seen. Such a pin is shown in conflict when a discovered project in another dir already uses the project name it would start with (its `project`, or the name Compose derives from its dir); the running project itself is not affected. |
| **Pin file** | `~/.config/dock-n-roll/services.yaml` — owner-edited overrides keyed by working dir, optionally narrowed by `project` (§8). Watched: reloaded on change. |
| **Relevant container** | A container of the project, excluding one-off containers (label `com.docker.compose.oneoff=True`). A relevant container exited with code 0 counts as *done* (init / migration job) when at least one other relevant container runs. |
| **Health source** | Per container, its Docker `HEALTHCHECK` status wins. Only when **no** relevant container has a `HEALTHCHECK`, the service-level `healthUrl` from the pin file gates readiness (HTTP 2xx/3xx, polled every 2 s while all relevant containers run or are done and the gate has not passed yet, whatever started them). Health is read on running containers only: a stopped container may keep a stale value. Otherwise: container `running`. |
| **Pending operation** | Per service, `start` or `stop` requested by the app and not finished yet. Owned by ServiceController; at most one at a time. |
| **Listening port** | A TCP socket in `LISTEN` state on the host, from `ss -ltnp` joined with Docker port bindings. |

## 4. Service status (derived, never stored)

The status is a **pure function** of the relevant containers, the pending operation, the
existence of the compose files and the conflict check. It is recomputed on every input
change; it is not a state machine maintained by the app.

| Status | Colour | Meaning | Start | Stop | Restart |
|---|---|---|---|---|---|
| `invalid` | grey | a container of the project carries Compose labels that fail the R4 checks — the reason is shown | disabled | disabled | disabled |
| `conflict` | grey | same project name seen with ≥ 2 working dirs — both listed | disabled | disabled | disabled |
| `missing` | grey | working dir or a `config_files` path no longer exists | disabled | allowed if containers run | disabled |
| `stopping` | orange | stop pending | disabled | disabled | disabled |
| `starting` | orange | start pending, or ≥ 1 container `health=starting`, or all running but the `healthUrl` gate not passed yet | disabled | allowed if no pending operation | allowed if no pending operation |
| `on` | green | ≥ 1 relevant container, and all ready (or done) | disabled | allowed | allowed |
| `off` | red | all relevant containers stopped (or none yet, pinned) | allowed | disabled | disabled |
| `partial` | orange | anything else (some running, some stopped, or a container paused, restarting, removing or unhealthy) | allowed, except while a container is `restarting` or `removing` | allowed | allowed |

**Precedence** — first match wins, top to bottom of the table:
`invalid > conflict > missing > stopping > starting > on > off > partial`.

If the Docker daemon is unreachable, the dashboard shows an app-level banner and service
rows are greyed out **without** a status badge — this is not a service status.

## 5. Use cases (Cockburn, brief)

Primary actor for all: **Developer**. Supporting actor: **Docker Engine**.

### UC1 — Start a service

- **Precondition**: no pending operation; status `off` or `partial`; Docker reachable.
- **Main success scenario**:
  1. Developer clicks the red button (dashboard) or the menu item (tray).
  2. System sets pending `start` → status `starting`.
  3. System runs, in the working dir,
     `docker compose --project-name=<name> --project-directory=<dir> --file=<f1> [--file=<f2>…] up -d --wait --wait-timeout=180`.
     Compose itself waits until every service is running or healthy.
  4. Command exits 0 → System clears pending; the status is derived again (`on` once the
     `healthUrl` gate, if any, passes).
- **Extensions**:
  - 3a. Pinned service with no container yet → System runs
    `docker compose [--project-name=<pin project>] --project-directory=<dir> up -d --wait --wait-timeout=180`
    without `--file` (Compose finds the files; it derives the name when the pin has no `project`).
  - 4a. Command exits non-zero (error, unhealthy or 180 s timeout) → pending cleared, status
    derived from real state, error shown with an stderr excerpt.
  - \*a. Status is `missing` or `conflict` → button disabled with a tooltip explaining why.
  - \*b. Developer clicks again while pending → ignored (button disabled).

### UC2 — Stop a service

- **Precondition**: no pending operation; status `on`, `partial`, `starting` (container-driven, e.g. booting after a terminal start) or `missing` with running containers.
- **Main success scenario**:
  1. Developer clicks the green button (dashboard) or the menu item (tray).
  2. System sets pending `stop` → status `stopping`.
  3. System runs `docker compose --project-name=<name> stop` from cwd `/`, without
     `--file`: Compose stops by project label, so it works even if the folder is gone.
  4. Command exits 0 → pending cleared, status derived (`off`).
- **Extensions**:
  - 3a. Command exits non-zero → pending cleared, status derived from real state
    (`on`, `partial` or `off`), error shown with an stderr excerpt.
- **Note**: `stop`, never `down` — `down` removes containers, which would erase the Compose
  labels auto-discovery relies on (ADR-0003) and make the service disappear.
- **Note**: stopping during a pending start is not offered in V1 (avoids `stop` racing with `up`).

### UC3 — Consult services status

- Developer opens the tray menu or the dashboard; system lists services (pinned first, then
  discovered, hidden excluded) with their live status. Status refreshes on Docker events,
  no polling of the Docker API; the main process pushes every change to the dashboard and
  the tray menu.
- **Event stream contract**: subscribe to every container event that can change a status (`create`, `start`, `restart`, `die`, `stop`, `kill`, `pause`, `unpause`, `rename`, `update`, `health_status`; `destroy` removes the container) **before** the initial container list, then apply buffered
  events. On stream end or error: banner, reconnect with backoff (1 s doubling up to 30 s),
  then the same sequence as at startup — resubscribe with buffering, full re-list (resync),
  apply the buffered events — so no change is lost between the list and the subscription.
  Path existence (`missing`) is checked at each resync and before each start, since no event
  reports it.
- **Extension 3b (v1.1) — crash notification**: a running container of a listed service
  that stops on its own shows a desktop notification. A crash is a `running` container
  becoming `restarting` or `dead`, or `exited` with `OOMKilled` or an exit code other
  than 0, 130, 137 and 143 (signal exits: `docker stop` or Ctrl-C from a terminal — owner
  MCDA A, 450/500). Never for a service with a pending operation (Stop, Restart) or in the 10 s after its
  Stop ended (apps that exit 1 on SIGTERM), never on the
  first snapshot after a (re)connection, at most one per service per minute. Diagram 13.

### UC4 — Inspect background activity

- Developer opens the "Running" tab; system lists:
  - containers (name, image, state, health while running, Compose project if any); published
    ports appear in the ports list below, with the container as owner (uptime is not shown in V1);
  - listening TCP ports (address:port, process name + PID when visible, else the container
    publishing it, else "unknown (root process)").
- Read-only in V1.

### UC6 — Restart a service (v1.1)

- **Precondition**: Stop is allowed (UC2) and the status is not `missing` (the `up` needs the files).
- **Main success scenario**: UC2 steps 2–4, then UC1 from its step 2 under the same pending
  entry (`stopping`, then `starting`), so edits to the Compose file or `.env` apply —
  `docker compose restart` would keep the old container config. Diagram 12.
- **Extensions**: the stop fails → no `up`, error shown as in UC2 3a; the `up` fails → as UC1.
- **Note**: the `healthUrl` gate is reset before the `up`, even if Docker never showed the
  stack down.

### UC7 — Read a service's logs (v1.1)

- **Precondition**: the service is listed in the dashboard (not in the tray).
- **Main success scenario**: Developer clicks Logs on a service row → system shows the last
  500 lines of one of its containers (first running, else first) and follows new lines until
  the panel closes. A service with several containers offers a container picker. Diagram 14.
- **Extensions**: no container yet → "No container yet", Reopen offered; the container stops
  or the daemon drops → stream ended, Reopen offered; the dashboard is hidden or reloaded →
  stream closed, lines kept, "Logs closed", Reopen offered.
- **Note**: text only (no HTML, ANSI removed); only one panel open at a time; read-only.

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
  with values read from Docker labels / the pin file. Arguments use the `--flag=<value>` form;
  `config_files` (comma-separated label) is split into one `--file=` per path. Project names
  must follow Compose's rule `^[a-z0-9][a-z0-9_-]*$`; paths must be absolute and NUL-free and
  are normalized (`/home/x/` = `/home/x`). A label failing these checks puts its project in status
  `invalid` (§4, §10 P2); an invalid pin entry is rejected with a message.
- **R5 — Tray click on Linux**: StatusNotifierItem does not guarantee which click activates
  the icon (Electron `Tray` docs) → all actions are reachable through the tray **menu**.
- **R6 — URL opening**: `url` and `healthUrl` must use the `http:` or `https:` scheme; any
  other value is rejected at pin-file load (`shell.openExternal` on a `file:` or custom scheme
  can launch local programs).

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
  - workingDir: /home/vev/Documents/02_personal/some-app
    project: some-app-qa   # optional: narrows the pin to one project of a shared dir
    name: Some app (QA)
```

| Key | Required | Meaning |
|---|---|---|
| `workingDir` | yes | absolute path; matches the `com.docker.compose.project.working_dir` label |
| `project` | no | narrows the entry to one project name; absent → applies to every project of that dir |
| `name` | no | display name |
| `url` | no | `http:`/`https:` only (R6) — enables UC5 |
| `healthUrl` | no | `http:`/`https:` only — readiness gate when no container has a `HEALTHCHECK` (§3) |
| `pinned` / `hidden` | no | ordering / exclusion |

## 9. Resolved questions (owner, 2026-10-09)

- Q1 — Pin file reload: **watched automatically**; an invalid YAML keeps the last valid
  config and shows a warning (never a crash).
- Q2 — Containers not part of any Compose project (e.g. `pyinstaller-test`): **monitor only**,
  never exposed as services.

## 10. Points resolved in the adapters PR (designed 2026-10-10)

- **P1 — Real project name of a never-started pin.** Without a `project` key, Compose takes the
  name from the compose file's top-level `name:` (or `COMPOSE_PROJECT_NAME`) before the dir
  basename; the domain only knows the basename (`defaultProjectName`), so a conflict can be
  missed. **Design**: ComposeRunner resolves the real name with
  `docker compose --project-directory=<dir> config --format=json`, run in the project dir with
  remote includes disabled (field `name`, checked against the Compose name rule), for each pin
  without `project` — again whenever the pin file changes — and passes the results to
  `buildServices`, where they are a required input. Observed on the workstation: dir `sonarqube-stack`, real name
  `sonarqube`. If resolution fails, the basename rule stays the fallback.
- **P2 — Containers with invalid labels.** A container whose Compose labels fail the R4 checks
  was dropped from discovery, which could hide a whole project or one of its containers.
  **Design**: such containers are grouped by their raw project / working-dir labels like any
  other; a project with at least one invalid container gets status `invalid` (§4: grey,
  controls disabled, reason shown) instead of disappearing or showing a misleading status.
  Its project name, when valid, still counts as used by its dir for conflict detection.
