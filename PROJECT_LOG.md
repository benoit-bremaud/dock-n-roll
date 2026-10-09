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
  - Pre-push review: 3 Must (dev CSP, quit flow, Electron download docs) resolved; PR #2 opened,
    stacked on PR #1. CI follow-up `ed57e1f`: gitleaks-action needs `pull-requests: read` to
    list the PR commits (403 without it).
- **Domain** (branch `feat/domain`, class diagram `05-class-domain.md`), written test-first
  (owner decision: TDD for the pure domain):
  - Six pure modules under `src/main/domain`: Compose labels, pin-file validation, service
    catalog (identity, conflicts, pin merge, ordering), status derivation and allowed controls,
    compose argument builder, port join.
  - Tests pin the workstation cases: the `sonarqube` name collision, a pinned service with no
    container deriving `off` (not `on`), the IPv4 + IPv6 binding of port 9000 listed once,
    flag-shaped label values kept inert.
  - `Domain dependency rule enforced by lint` — `no-restricted-imports` on `src/main/domain`
    (Electron, dockerode, Node IO, YAML, parent imports).
  - `Pin validation hand-written` — seven keys; zod rejected as an extra dependency for little gain.
  - Pre-push review (design, tests, security, docs): 6 Must, 10 Should, 7 Nice. Owner decision:
    Must + Should, Nice deferred. Fixed test-first (39 red tests, then green; 131 tests):
    - `healthUrl gate held by done jobs` — an exited-0 init job no longer turns a stack `on`
      before its `healthUrl` answers.
    - `Compose name and path rules` — project names must match Compose's
      `^[a-z0-9][a-z0-9_-]*$`; paths absolute, NUL-free, normalized. An empty `project` label
      would otherwise have produced `--project-name=` and stopped another project.
    - `Never-started pins checked for conflicts` — under their `project` or the name Compose
      derives from their dir, so Start cannot take over a project running from another dir.
    - `--project-directory` added to `up`; inherited `COMPOSE_*` variables to be removed by the
      runner (ADR-0002).
    - Spec §3 / §4 / R4, ADR-0002 and the class diagram updated in the same change.
- **Automated PR review round** (the second configured bot reviewer could not be requested:
  HTTP 422, not a collaborator): two findings, each verified against the source and validated
  by the owner, fixed and answered inline.
  - PR #1: the reconnect path re-listed before resubscribing, losing changes in between →
    `ff51690`, reconnect repeats the startup sequence.
  - PR #3: a stopped container's stale health disabled the `healthUrl` gate → `9a52770`.
- **PR #1 merged** (`618bac5`) — `docs(architecture): add V1 conception for dock-n-roll`.
- **PR #2 merged** (`4b11790`) — `chore(scaffold): add Electron + React + TypeScript skeleton with CI`.
  - **Incident**: merging #1 with `--delete-branch` deleted the base of stacked #2, and GitHub
    closed #2 instead of retargeting it. Recovery: base branch pushed back at `ff51690`, #2
    reopened, retargeted to `main`, base deleted again. No code lost.
  - **Decision** `Stacked PRs merge with merge commits` — squash would have required a rebase
    and a force-push of every upper branch. The next PR is retargeted before a branch is deleted.
- **PR #3 merged** (`e8d142b`) — `feat(domain): add pure service domain with tests`.
- **Next**: PR 4, adapters, carrying spec §10 P1 and P2.
