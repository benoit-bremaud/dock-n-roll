# Local review — dock-n-roll (branch docs/v1-conception)

- Date: 2026-10-09
- Commit: b5e570b
- Scope: whole branch (main has no commit yet) — 11 files, documentation only
- Checks run: design · docs · security (spec-level) · correctness (cross-doc consistency) · tests: not applicable (no code)
- Verdict: fix Must Have first · Must 4 · Should 7 · Nice 4 — all Must resolved and verified (see Resolution)

## 🔴 Must Have

- `decisions/0003-service-discovery.md:29` · `specs/v1-spec.md:71` `[design|docs]` · A pinned, never-started project has no container, hence no project name and no `config_files` label: UC1 cannot build its command. · Fallback: no container yet → `docker compose up -d` in `workingDir` (Compose resolves name and files); identity = `workingDir` until a first container is seen. Optional `project` pin key (see S4).
- `diagrams/launcher/02-sequence-start-service.md:26` · `specs/v1-spec.md:81` `[design|correctness]` · The guard checks the displayed status, which events mutate during `up`: a second click can spawn a second `up`; `Starting → Stopping` runs `stop` while `up` still creates containers. · Per-service `pending: start | stop | null` owned by ServiceController; guard on `pending`; stop disabled while a start is pending in V1.
- `diagrams/launcher/04-state-service.md:14` · `specs/v1-spec.md:48` `[design|docs|correctness]` · Status is drawn as a hand-written FSM that is incomplete (`On → Starting`, `Off → Partial`, `[*] → Starting`, any → `Missing`/`Conflict`, `Stopping → On` on failed stop missing; `Missing/Conflict → Off` wrong) and contradicts §4 (`missing` disables start only vs all controls); "unknown" reads as a 7th status; UC2 has an unnumbered scenario but a "3a" extension that cannot yield `on`. · Status becomes a pure derivation with an explicit precedence: `conflict > missing > pending stop → stopping > pending start → starting > any health=starting → starting > all ready → on > all stopped → off > partial`. Rewrite 04 as "derived status" + precedence; daemon unreachable = rows greyed, no badge; number UC2 steps; failures recompute from real state.
- `decisions/0002-compose-lifecycle-via-cli.md:16` · `02-sequence-start-service.md:39` `[design|correctness]` · Event stream lifecycle unspecified: no reconnect after a daemon restart, list-then-subscribe race, event set lacks `die`/`stop`/`destroy` (AC5 and conflict resolution never observed). · Subscribe (container: create, start, die, stop, destroy, health_status) before the initial list and apply buffered events; on stream end → banner + reconnect with backoff 1→30 s + full resync.

## 🟡 Should Have

- `decisions/0002-compose-lifecycle-via-cli.md:14` · `specs/v1-spec.md:82,55` `[design|docs]` · Stop wording diverges between ADR and spec; `-f`/cwd make stop fail when the folder is gone, exactly when stop is still wanted. · `docker compose --project-name=<name> stop`, no `-f`, neutral cwd (Compose stops by project label); stop allowed in `missing`; `missing` checked against `config_files` paths on resync and before start.
- `specs/v1-spec.md:50` `[design]` · One-shot containers (init/migrations exited 0, `docker compose run` leftovers) keep a stack `partial` forever. · Ignore `com.docker.compose.oneoff=True`; a container exited 0 counts as done when another container runs.
- `02-sequence-start-service.md:38` · `specs/v1-spec.md:43,76` `[design|docs]` · Custom readiness loop duplicates Compose; `healthUrl` scope (per container vs per service), polling and timeout are undefined; "default 180 s" implies a config key that does not exist. · `up -d --wait --wait-timeout 180` (flag verified in Compose source via Context7; behaviour with exited-0 one-shots to be checked at implementation); container `HEALTHCHECK` wins, `healthUrl` gates the service only when no container has one, polled every 2 s while not `on` whatever started it; fixed 180 s in V1.
- `specs/v1-spec.md:42` · `decisions/0003-service-discovery.md:23` `[design]` · Pins keyed by `workingDir` alone cannot tell apart `-p qa1` / `-p qa2` from the same folder (mirror case of R1). · Optional `project` key; absent → the pin applies to every project of that dir.
- `diagrams/launcher/03-component.md:19,39,53` `[design|docs]` · `preload` drawn in the main process (it runs in the renderer); `SC → PortScanner` is a pass-through (UC4 is not service control); HTTP probe has no adapter; no push channel for AC5 and tray refresh; `shell.openExternal` and autostart egress missing; port join not placed. · Move Preload to Renderer; `BackgroundMonitor` called directly by IPC; add `HealthProbe`; `statusChanged` push (main → renderer, SC → TrayMenu); add browser + autostart egress; port join in `domain`.
- `specs/v1-spec.md:113` `[security]` · Pin-file `url` goes to `shell.openExternal` (a `file:` or custom scheme could launch a program); label values reach `execFile` as arguments (flag-shaped or relative values, comma-separated `config_files`). · Only `http:`/`https:` for `url` and `healthUrl`; `--project-name=` / `--file=` forms; split `config_files` on commas; reject non-absolute paths.
- `decisions/0002-compose-lifecycle-via-cli.md:8` `[docs]` · "Compose v2 has no programmatic API" vs "Compose v5.6.0 installed". · "Compose ships no Node/TypeScript API; driving it from Electron means its CLI."

## 🔵 Nice to Have

- `specs/v1-spec.md:107` `[docs]` · R1 wording describes one project, not a collision. · "Project `sonarqube` has containers from two working dirs."
- `decisions/0002-compose-lifecycle-via-cli.md:22` `[design]` · Re-running `up` from labels does not replay profiles / `--env-file` used originally. · Document as a known V1 limitation.
- `specs/v1-spec.md:136` `[docs|security]` · Pin-file example exposes real workstation paths. · Use `~/projects/...` placeholders; link "Diagrams" at `:4`.
- `diagrams/launcher/03-component.md:52` `[security]` · Renderer hardening states isolation and sandbox but no CSP / remote-content rule. · Add: strict CSP, local files only, `will-navigate` blocked.

## ⚪ Disagree / Intentional

- `diagrams/launcher/03-component.md:8` `[design]` · Flat layering, no ports layer · justified by the `architecture` doctrine (seam only with a second implementation).
- `diagrams/launcher/03-component.md:23` `[design]` · Three pure `domain` modules · rule-bearing pure functions, not layers.
- `diagrams/launcher/02-sequence-start-service.md:9` `[docs]` · UC2 not drawn as a sequence · mirrors UC1 once S1 is applied.
- `[security]` · Docker labels are writable by any container creator · whoever can create containers already has root through the Docker socket; argument hardening (Should list) is the proportionate answer.

## Resolution (owner decision: apply Must + Should, defer Nice)

| Finding | Response | Where |
|---|---|---|
| M1 pinned never-started start | done | spec §3, UC1-3a · ADR-0002 · ADR-0003 |
| M2 pending-operation guard | done | spec §3, UC1, UC2 · ADR-0002 · 02-sequence |
| M3 derived status + precedence | done | spec §4, UC2 numbered · 04-state rewritten as derivation |
| M4 event stream lifecycle | done | spec UC3 · ADR-0002 |
| S stop without `--file`, allowed in `missing` | done | spec §4, UC2 · ADR-0002 |
| S one-off / exited-0 containers | done | spec §3 · ADR-0003 |
| S `up --wait`, `healthUrl` semantics, fixed 180 s | done | spec §3, UC1 · ADR-0002 · 02-sequence |
| S optional `project` pin key | done | spec §8 · ADR-0003 |
| S component diagram corrections | done | 03-component |
| S `http`/`https` only, argument hardening | done | spec R4, R6, §8 · ADR-0002 |
| S ADR-0002 Compose wording | done | ADR-0002 |
| N R1 wording | deferred — backlog | — |
| N profiles / `--env-file` limitation | deferred — backlog | — |
| N personal paths in pin example | deferred — backlog (repo stays private) | — |
| N renderer CSP / navigation lock | deferred — backlog, to settle at Electron scaffold | — |

### Verification pass (design reviewer, after fixes)

Findings 1–9: 7 resolved, 2 partially resolved — completed by the items below.

| New finding | Severity | Response |
|---|---|---|
| A — zero containers derive as `on` (vacuous "all ready") | 🔴 Must | done — `on` requires ≥ 1 relevant container (spec §4, 04-state) |
| B — status during the `healthUrl` wait fell to `partial`; gate polled while `off` | 🟡 Should | done — `starting` covers the gate wait; polling only while containers run (spec §3, §4, 04-state) |
| C — Stop blocked on container-driven `starting` | 🟡 Should | done — Stop allowed on `starting` without pending operation (spec §4, UC2) |
| D — 02 failure branch lists too few outcomes | 🔵 Nice | deferred — backlog |
| E — UC1-3a ignores the pin `project` key | 🔵 Nice | deferred — backlog (to fix at implementation of the start command) |
| F — `missing` outranks `stopping` | 🔵 Nice | deferred — backlog (pending guard already blocks double operations) |

## Per-dimension summary

- Design: proportional structure; four real behavioural gaps (pinned start, concurrency, derived status, event lifecycle) and one FSM over-modelling.
- Docs: links, numbering and Markdown hygiene clean; several contracts described differently across spec / ADR / diagrams.
- Tests: not applicable (no code); the precedence function is the designated unit-test target.
- Security: local-only design sound; harden `openExternal` and CLI arguments.
- Correctness: race conditions and lost events would break AC3/AC5 as specified.
