# PROJECT_LOG — dock-n-roll

Chronological operational logbook. Complements `git log` with the human context.

## 2026-10-09

- **Project inception** (brainstorm session). Need: one-click ON/OFF of local dev services from
  the desktop, plus visibility on what runs in the background.
- **Decisions** (brainstorm, recorded as proposed ADRs on branch `docs/v1-conception`):
  - `UI form` — GNOME top-bar icon (AppIndicator) + dashboard window; rejected plain app window
    (must be opened each time) and local web dashboard (not on the desktop, needs a server).
  - `V1 scope` — control Docker Compose projects only; monitor sees containers and all listening
    ports. Shell commands / systemd deferred: they require process supervision, the riskiest part.
  - `Stack` — Electron + TypeScript (ADR-0001).
  - `Lifecycle` — `docker compose` CLI via `execFile`, observation via the Engine API events,
    `stop` never `down` (ADR-0002).
  - `Discovery` — Compose labels + hand-edited pin file; identity = (project name, working dir)
    (ADR-0003).
- **Workstation findings** feeding the spec (`docs/architecture/specs/v1-spec.md` §6): project
  name `sonarqube` shared by two working dirs (collision → `conflict` status); unprivileged `ss`
  cannot see the process behind Docker-published ports.
- **Conception drafted**: V1 spec, ADR-0001..0003, UML (use case, sequence "start a service",
  component, state "service status").
- **Conception gate passed** — owner validated spec + ADRs (now `accepted`) + UML. Open
  questions resolved: pin file reloaded automatically on change; non-Compose containers shown
  in the monitor only.
