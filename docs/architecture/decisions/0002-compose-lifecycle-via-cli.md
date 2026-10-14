# 0002 — Lifecycle via the `docker compose` CLI, observation via the Engine API

- **Status**: accepted
- **Date**: 2026-10-09

## Context and problem statement

Services are Compose projects. Compose ships no Node/TypeScript API: driving it from
Electron means its CLI. Starting containers one by one through the Engine API would ignore
`depends_on` ordering, health conditions and other Compose semantics.

## Decision outcome

- **Start**: spawn, with Node `execFile` (argument array, no shell), cwd = working dir:
  `docker compose --project-name=<name> --project-directory=<dir> --file=<f>… up -d --wait --wait-timeout=180`.
  `--project-directory` keeps relative paths and `.env` resolved from the working dir the
  project was created from.
  `--wait` makes Compose block until every service is running or healthy (flag defined in
  Compose `cmd/compose/up.go`, checked via Context7 on 2026-10-09), so exit code 0 means ready
  and the app needs no readiness loop of its own. A pinned project with no container yet runs
  the same command without `--project-name` / `--file` (Compose resolves them from the dir).
- **Stop**: `docker compose --project-name=<name> stop`, no `--file`, cwd `/`: Compose stops
  by project label, so stop still works when the folder is gone, and no compose file or
  `.env` of an unrelated cwd can change which services it loads.
- **Working directory**: `up` and the name resolution (`config`, spec §10 P1) run in the
  project dir, so both read the same project `.env` (which can set `COMPOSE_PROJECT_NAME` /
  `COMPOSE_FILE` when no flag is given): the name checked for conflicts is the name `up` uses.
- **Stop, never down**: `down` removes containers and therefore the labels that
  auto-discovery depends on (ADR-0003).
- **Concurrency**: at most one pending operation per service, owned by ServiceController;
  the guard is on the pending operation, not on the displayed status. No stop during a
  pending start in V1.
- **Observe**: Docker Engine API, called directly over its Unix socket (ADR-0005):
  - subscribe to every container event that can change a status (`create`, `start`, `restart`, `die`, `stop`, `kill`, `pause`, `unpause`, `rename`, `update`, `health_status`; `destroy` removes the container) **before** the initial list, then apply buffered events;
  - on stream end or error: app banner, reconnect with backoff (1 s doubling to 30 s), then
    the startup sequence again: resubscribe with buffering, full re-list, apply the buffer.
- **Argument hardening**: `--flag=<value>` forms only; the comma-separated
  `config_files` label is split into one `--file=` per path; project names must match
  Compose's rule `^[a-z0-9][a-z0-9_-]*$`; paths must be absolute and NUL-free. The domain
  builds the argument arrays and re-checks these rules (`InvalidServiceError`).
- **Environment**: the runner removes every inherited `COMPOSE_*` variable (files, profiles,
  env files, project name…) and `DOCKER_CONTEXT`, then sets `DOCKER_HOST=unix://<observed
  socket>`: the arguments alone decide the target, and `DOCKER_HOST` also overrides a context
  chosen with `docker context use` (`~/.docker/config.json`), so the CLI acts on the daemon the
  app displays. The name resolution additionally sets `COMPOSE_EXPERIMENTAL_GIT_REMOTE=0` and
  `COMPOSE_EXPERIMENTAL_OCI_REMOTE=0`: resolving a name must never clone or pull a remote
  `include:`.
- **Timeout**: a run is stopped with SIGTERM after its timeout, then SIGKILL after a grace
  period; the result names the timeout as the cause ahead of the CLI output.

### Consequences

- Good: exact Compose semantics; zero shell-injection surface; readiness delegated to Compose.
- Bad: depends on the `docker` CLI being on `PATH` (it is; Compose v5.6.0 installed).
- To verify at implementation: `--wait` behaviour with one-shot services that exit 0.
