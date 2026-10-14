# Local review — dock-n-roll (branch feat/controller)

- Date: 2026-10-14
- Commit: b4c9486 (reviewed), fixes in the following commit
- Scope: branch diff `main...feat/controller` — controller, IPC contract, tray menu, background view, composition root
- Checks run: design · tests · security · correctness · docs
- Verdict: Must 5 · Should 11 · Nice ~6 — Must and Should resolved (owner decision: Nice deferred)

## 🔴 Must Have — all done, test-first

- `src/main/controller/service-controller.ts` `[design|security]` · Two clicks in one tick ran two `docker compose up` · synchronous dir-busy check right before the pending entry is added.
- `service-controller.ts` `[security|design]` · A runner that throws left the operation pending forever · `try / finally`, the error becomes the row reason.
- `src/main/index.ts` `[design]` · A startup failure left an invisible app that the single-instance lock kept alive · error dialog, then quit.
- `src/shared/ipc.ts` · `03-component.md` · controller contracts `[docs]` · Stale header and API names, undocumented contracts · fixed.
- `service-controller.test.ts` `[tests]` · 20 of 27 mutants survived (failed stop, serialization, health reset, dispose…) · tests added; the serialization test now fails on its mutant.

## 🟡 Should Have — all done

- Publish only on change (the tray menu was rebuilt over D-Bus every 2 s).
- A never-started pin whose Compose name is unknown cannot start; a resolved one always starts under `--project-name=<resolved>`.
- A pending operation makes the whole dir busy, so a pin-file edit during `up` cannot allow a second one.
- Controls off while Docker is unavailable and before the first snapshot.
- Names resolved once per pin dir (a slow `config` no longer holds every input).
- Per-service state pruned when a service disappears; the error of a failed command follows the row across an id change.
- `urlOf` re-checks http/https for both the tray and the IPC (spec R6).
- `menuLabel`: `&` doubled, newlines and control characters removed, 80 characters max.
- IPC accepted only from the dashboard page (top frame of our window).
- `listBackground`: one shared `ss` scan, cached for 1 s.
- Docs: diagrams 07 / 08, ADR-0002 (socket rule), README, contracts.

## 🔵 Nice to Have — deferred

Error messages of main-process handlers reaching the renderer; `dockerSocketPath` normalization; the test helper `settle()`; `fs.stat` on every recomputation; typed `ContainerRow.state`.

## Per-dimension summary

- Design: conformant to diagrams 07 / 08; no deadlock in the serialized chain (checked by the design reviewer).
- Tests: 248 → 274; key rules mutation-checked.
- Security: no double command, no takeover through an unresolved pin, IPC origin checked, menu labels sanitized.
- Correctness: the live tray menu on the workstation matches the real projects and statuses.

## Verification pass (security reviewer, on b609c99)

Findings 1–11: 9 resolved, 1 partially (#4, completed by A below), 1 not resolved (#10 socket path normalization, nice — deferred).

| New finding | Severity | Response |
|---|---|---|
| A — a temporary name-resolution failure refused Start until restart | 🟡 Should | done — failed dirs retried after 30 s, before each recomputation (red test first) |
| B — a pending command on one project marked every project of the dir as pending (Stop disabled for minutes) | 🟡 Should | done — pending keyed by dir + project name; only a row with no name yet matches the whole dir (red test first) |
| C — "Docker unavailable" flashes in the tray before the first snapshot | 🔵 Nice | deferred |
| D — dev-server origin compared as a string prefix | 🔵 Nice | deferred (unpackaged builds only) |
| E — label truncation can split an emoji | 🔵 Nice | deferred |
