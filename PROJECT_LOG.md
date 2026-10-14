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
- **PR #4 merged** (`fda3875`) — `docs(log): record merges of PRs #1-#3 and the stacked-PR incident`.

## 2026-10-10 → 2026-10-14

- **Adapters** (branch `feat/adapters`), written test-first (owner decision: TDD for adapters too):
  - **Decisions**:
    - `Docker Engine API without SDK` (ADR-0005) — `node:http` over the Unix socket, three
      calls; `dockerode` rejected for six unused dependencies (gRPC, protobuf, tar-fs…) next to
      a root-equivalent socket.
    - `yaml` for the pin file (ADR-0005) — no dependency, alias expansion capped by default.
    - `One sync procedure` (diagram 06) — subscribe with buffering, list and inspect into a
      fresh map, apply the buffer; same at startup and after every stream loss.
    - Spec §10 P1 — real project name of never-started pins from `docker compose config`
      (workstation: dir `sonarqube-stack` → name `sonarqube`). P2 — new status `invalid`
      instead of hiding projects with unsafe labels.
    - `CLI pinned to the observed daemon` (ADR-0002) — every `COMPOSE_*` and `DOCKER_CONTEXT`
      removed, `DOCKER_HOST` set to the observed socket; `up` / `config` in the project dir,
      `stop` in `/`; remote `include:` disabled for name resolution.
  - Pre-push review (design, tests, security, docs): 5 Must, 11 Should — resolved; Nice
    deferred (owner decision). Verification pass: 3 more Should resolved (timeout bounded with
    process-group kill, unreadable container skipped, socket path required). Report:
    `docs/architecture/review-local.md`. 222 tests.
  - Read-only smoke run against the workstation Docker: statuses and port owners as designed;
    two real name collisions shown as `conflict` (`sonarqube`, `bulle-de-je`).
- **PR #5 merged** (`a2e58c6`) — `feat(adapters): add OS adapters for Docker, Compose, ss and the pin file`.
  The automated reviewer had reached its usage limit and the second bot reviewer returned 422,
  so no bot review was posted; merged on the owner's explicit instruction after the local review
  and its verification pass. An empty stray file (`ss.out`) had been swept into commit `67e68a4`;
  removed in the next branch (`5f5e73b`).

## 2026-10-14

- **Controller** (branch `feat/controller`, class diagram 07, sequence diagram 08), test-first
  (owner decision: factory function with injected adapters, real domain in the tests):
  - `ServiceController` orchestrates domain and adapters; every input triggers one serialized
    recomputation; `shared/ipc.ts` carries `ControllerState` / `ServiceView`; the tray menu is
    a pure `buildTrayMenu`; `index.ts` is the composition root.
  - **Decisions**:
    - `Commands re-checked in the main process` — the renderer only sends ids; controls, Docker
      availability and pending operations are checked before any command (spec §4, R6).
    - `Pending keyed by dir + project name` — survives the id change of a never-started pin;
      other projects of the same dir stay independent.
    - `Unresolved never-started pins cannot start` — resolved ones always start under
      `--project-name=<resolved>`; failed resolutions retried after 30 s.
    - `Publish only on change` — each push rebuilds the tray menu over D-Bus.
  - Pre-push review (design, tests, security, docs): 5 Must, 11 Should resolved (two clicks
    running two `up`, a stuck pending operation, a silent startup failure…); 20 of 27 test
    mutants had survived, now covered. Verification pass: 2 more Should resolved. 276 tests.
  - Smoke run on the workstation (AppIndicator extension now active): the live tray menu lists
    the real projects with statuses, controls and conflict reasons.
- **PR #6 merged** (`74ff0cd`) — `feat(controller): wire domain and adapters into the tray and IPC`.
  No bot review posted (automated reviewer at its usage limit); merged on the owner's explicit
  instruction after the local review and its verification pass.
- **Dashboard** (branch `feat/dashboard`, component diagram 09), test-first:
  - React window: Services tab (status word next to the colour badge, allowed controls only,
    reasons), banners for Docker outage and pin-file errors, Running tab (containers and ports,
    on open and Refresh).
  - **Decisions**:
    - `Renderer tests with React Testing Library + happy-dom` (ADR-0004 amendment) — chosen over
      logic-only tests and Electron end-to-end tests; preload API faked at its boundary.
    - `Rows greyed without badge while Docker is unavailable` — the spec §4 rule, applied in the
      review instead of changing the spec.
  - Live run found and fixed one defect: stopped containers showed a stale health in the
    Running tab.
  - Pre-push review: 5 Must, 12 Should resolved; no security finding. 302 tests.
