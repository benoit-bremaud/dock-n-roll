# Local review — dock-n-roll (branch feat/adapters)

- Date: 2026-10-11 (fixes), report written 2026-10-14
- Commit: 7d971ad (reviewed), fixes in 810e520
- Scope: branch diff `main...feat/adapters` — OS adapters, domain §10 P1/P2, ADR-0005, diagrams 03–06
- Checks run: design · tests · security · correctness · docs
- Verdict: Must 5 · Should 11 · Nice ~8 — Must and Should resolved (owner decision: Nice deferred)

## 🔴 Must Have — all done, each reproduced by a failing test first

- `src/main/adapters/compose-runner.ts` `[security|docs]` · A context selected with `docker context use` sent Start / Stop to another daemon than the observed one · `DOCKER_HOST=unix://<observed socket>` set in the child environment.
- `src/main/domain/service-catalog.ts` `[security|design]` · An invalid container dropped its project out of the name map, so a pin elsewhere could start under that name and take over its containers · every project with a valid name holds it, invalid ones included.
- `src/main/adapters/docker-observer.ts` `[design|security]` · A slow answer of an abandoned connection could overwrite the new snapshot · fresh map per sync, generation check before every write.
- `src/main/adapters/compose-runner.ts` · ADR-0002 `[security|docs]` · Inconsistent, undocumented cwd: name resolution and `up` could read different `.env` files · `up` and `config` run in the project dir, `stop` in `/`.
- `src/main/adapters/*.test.ts` `[tests]` · An event line split across chunks and the initial load of an existing pin file were untested · both covered.

## 🟡 Should Have — all done

- `docker-observer.ts` · Non-200 list treated as an outage; only 404 removes a container; a response cut mid-body rejects instead of hanging; listener errors are logged, never reported as Docker outages; retry scheduler injectable.
- `compose-runner.ts` · Remote git / OCI `include:` disabled for name resolution; timeout cause named ahead of the CLI output; SIGTERM then SIGKILL after a grace period; synchronous `execFile` errors reported as failed runs.
- `service-catalog.ts` · `resolvedNames` is required, with its refresh policy documented.
- `eslint.config.mjs` · Adapters import guard fixed (`**/renderer/**`, `**/preload/**`), proven with a probe file.
- `pin-file-store.ts` · Sequential reloads, watcher error handler, re-arm after the directory is removed, listener errors caught.
- `port-scanner.ts` · Crafted process names can no longer misattribute a port (match anchored on `,fd=N)`).
- Tests · Exact backoff sequence and reset, 404 live and during a sync, abandoned-connection guard, live event during the buffered flush, debounce / close / filename filter, real `ss` scan of the test's own port.
- Docs · Event list, diagram 06 message names, class diagram (`ComposeLabels`, `ResolvedNames`, conflict rule), ADR-0002, spec §10, README, contracts of exported functions.

## 🔵 Nice to Have — deferred

- Absolute paths for `docker` and `ss`; `DOCKER_CONFIG` / `DOCKER_API_VERSION` passthrough.
- One publish per drained event queue instead of one per event.
- Comment on grouping invalid containers that have no working-dir label.

## Per-dimension summary

- Design: structure conformant to ADR-0005 and diagrams 03 / 06; one concurrency defect fixed.
- Tests: 199 → 220; stable across repeated and loaded runs; mutation-checked race test.
- Security: daemon pinned, takeover via invalid labels closed, no background remote fetch.
- Correctness: HTTP errors, truncated responses and listener faults no longer corrupt or freeze state.
- Docs: ADR-0002, spec and diagrams match the code.

## Verification pass (security reviewer, probes re-run on 810e520)

Findings 1–11: 9 resolved, 1 partially (#8 missing-cwd message, nice), 1 not resolved by design (#9 binaries from `PATH`, nice — deferred).

| New finding | Severity | Response |
|---|---|---|
| N1 — the timeout did not bound the wait when a grandchild (Compose plugin) held the pipes: 3 s instead of 0.6 s | 🟡 Should | done — `spawn` in its own process group, SIGTERM / SIGKILL sent to the group, result settled at the end of the grace period (red test first) |
| N2 — one container with an unreadable inspect made the observer fail on every retry | 🟡 Should | done — that container is skipped and logged (red test first) |
| N3 — `socketPath` defaulted to `/var/run/docker.sock`, wrong for rootless Docker | 🟡 Should | done — `socketPath` required in `RunOptions` and `composeEnv` |
| N4 — re-arm can leak a watcher if triggered twice; no retry after a failed `mkdir` | 🔵 Nice | deferred — backlog |
