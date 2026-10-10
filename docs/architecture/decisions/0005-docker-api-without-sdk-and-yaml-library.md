# 0005 — Docker Engine API over `node:http`, `yaml` for the pin file

- **Status**: accepted
- **Date**: 2026-10-10
- **Amends**: ADR-0001 and ADR-0002, which named `dockerode` for Docker access

## Context and problem statement

The adapters need three Docker Engine calls — list containers, inspect one, follow the event
stream — and a YAML parser for the hand-edited pin file. Both sit next to the
root-equivalent Docker socket (spec R4), so every dependency is attack surface.

Facts checked on the workstation (2026-10-10): Docker Engine 29.8.2, API 1.56 (minimum 1.40).
`GET /containers/{id}/json` returns `State.Status`, `State.ExitCode`, `State.Health`,
`Config.Labels` and `NetworkSettings.Ports`; `GET /events` streams one JSON object per line.

## Considered options

Docker access:
1. `dockerode` 5.0.1 — depends on `@grpc/grpc-js`, `@grpc/proto-loader`, `protobufjs`,
   `tar-fs`, `docker-modem`, `@balena/dockerignore` (build, gRPC and tar features we never use).
2. **Node `http.request` with `socketPath: /var/run/docker.sock`** — no dependency.

YAML parser:
1. **`yaml` 2.9.1** (eemeli) — no dependency; YAML 1.2; alias expansion capped by default
   (`maxAliasCount` 100, "billion laughs"); duplicate keys rejected; errors carry line/column.
2. `js-yaml` 5.4.3 — one dependency (`argparse`), also safe by default.

## Decision outcome

- **Docker: `node:http` over the Unix socket**, versioned path `/v1.47` (well above the
  daemon minimum, below the current version). Three calls only: `GET /containers/json?all=1`,
  `GET /containers/{id}/json`, `GET /events?filters={"type":["container"]}`. Responses are
  read into the domain `ContainerSnapshot` by one pure mapping function.
- **YAML: `yaml`**, `parse(text)` with default options; a parse error keeps the last valid
  pin file and reports the message with its line (spec §9 Q1).

### Consequences

- Good: no new transitive dependency next to the Docker socket; full control of timeouts and
  stream lifetime; pure mapping functions are unit-tested against recorded API responses.
- Bad: ~100 lines of HTTP / stream handling written and maintained here instead of in a library.
- The `--wait` behaviour with exited-0 one-shot services (ADR-0002) is checked when the
  runner is first used against a real stack.
