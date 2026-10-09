# 0002 — Lifecycle via the `docker compose` CLI, observation via the Engine API

- **Status**: accepted
- **Date**: 2026-10-09

## Context and problem statement

Services are Compose projects. Compose v2 has no programmatic API of its own: it is a CLI
over the Docker Engine API. Starting containers one by one through the Engine API would
ignore `depends_on` ordering, health conditions and other Compose semantics.

## Decision outcome

- **Start/stop**: spawn `docker compose -p <name> -f <file>… up -d` / `stop` with
  Node `execFile` (argument array, no shell), cwd = the project working dir.
- **Observe**: Docker Engine API through `dockerode` — container list at startup, then the
  `/events` stream for live updates (no polling).
- **Stop, never down**: `down` removes containers and therefore the labels that
  auto-discovery depends on (ADR-0003).

### Consequences

- Good: exact Compose semantics; zero shell-injection surface (no shell, values come only
  from Docker labels / the pin file).
- Bad: depends on the `docker` CLI being on `PATH` (it is; Compose v5.6.0 installed).
