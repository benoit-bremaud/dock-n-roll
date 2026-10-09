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
- **Pre-push local review** of branch `docs/v1-conception` (design, docs, spec-level security,
  cross-doc consistency; tests not applicable): 4 Must, 7 Should, 4 Nice — report in
  `docs/architecture/review-local.md`. Owner decision: apply Must + Should, defer Nice.
- **Decisions** (from the review):
  - `Derived status` — the service status is a pure function with a fixed precedence
    (`conflict > missing > stopping > starting > on > off > partial`), not a stored state
    machine; Docker changes state on its own, a transition list could never stay complete.
  - `Readiness delegated to Compose` — `up -d --wait --wait-timeout 180` replaces a custom
    readiness loop.
  - `Pending-operation guard` — one start/stop at a time per service; no stop during a start in V1.
  - `Stop by project label` — `stop` without `--file`, so it works when the folder is gone.
- **Repository published**: `benoit-bremaud/dock-n-roll` created private; empty root commit
  `9a9a5ab` (`chore: initialize repository`) pushed to `main` as the only direct commit, needed
  to give PR #1 a base. PR #1 opened from `docs/v1-conception`.
- **Implementation plan validated**: six PRs — scaffold, domain, adapters, controller,
  dashboard, autostart/packaging.
- **Scaffold** (branch `chore/scaffold`, ADR-0004):
  - `Renderer` — React + CSS design tokens; vanilla TypeScript rejected (hand-written live DOM sync).
  - `Hand-written scaffold` — no generator executed; exact version pins; pnpm `allowBuilds`
    limited to `esbuild`. Electron 44 has no install script and downloads its runtime lazily,
    but electron-vite 5 does not trigger that download, so `dev` / `start` run
    `install-electron` first.
  - `Version constraints` — electron-vite 5 needs Vite ≤ 7; typescript-eslint 8 needs TypeScript < 6.1.
  - `CI while private` — Gitleaks + `pnpm audit`; CodeQL and dependency-review deferred to the
    public release (both need GitHub code security, unavailable on a private personal repo).
  - Smoke run: the app starts and the single-instance lock works. The tray icon could not be
    checked on screen because the GNOME AppIndicator extension was inactive on the workstation.
