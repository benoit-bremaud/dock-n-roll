# Local review — dock-n-roll (brick B: runtime robustness)

- Date: 2026-10-15
- Commit: 442449d
- Scope: branch diff main...fix/runtime-robustness
- Checks run: design · docs · tests · security · correctness
- Verdict: fix Must Have first  ·  Must 2 · Should 7 · Nice 3
- Resolution: all Must and Should applied (`bb…` commits below); Nice: pin comment and 1999 ms check applied, the fixed-sleep test kept as noted

## 🔴 Must Have
- `src/main/controller/service-controller.ts:283` `[design|correctness]` · A **rejecting** `resolveProjectName` makes `Promise.all` reject: `failedAt` is never set, `.finally` recomputes, the same dirs are due again → hot loop of `docker compose config` spawns; one bad dir also drops the others' names · catch per dir (`.catch(() => null)`) so every failure lands in `failedAt`; test with a rejecting fake asserting one call.
- `src/main/controller/service-controller.test.ts:502` `[tests]` · "one name resolution at a time" also passes on the old code (false confidence); no test for dispose during a held resolution · rewrite to prove the `resolving` guard (second due dir while the first call is held, chain not blocked); add hold → dispose → release → no `onChange`.

## 🟡 Should Have
- `src/main/controller/service-controller.ts:270` `[correctness|docs]` · A failed name is retried only when another input arrives, while diagrams 07/08 say "retried after 30 s" · schedule one `recompute()` after `NAME_RETRY_MS` on failure (via `deps.schedule`), cancelled on `dispose`.
- `src/main/adapters/pin-file-store.ts:176` `[correctness]` · A failed or timed-out re-arm leaves no watcher: pin edits ignored until restart · retry the re-arm after a delay, timer cleared on `close()`.
- `src/main/controller/service-controller.ts:264` `[design]` · `resolveNamesInBackground` also prunes caches and republishes `resolvedNames` (SRP) · split into `pruneNames(dirs)` + the single-flight launch.
- `src/main/adapters/pin-file-store.ts:93` `[design]` · Three loose flags form an implicit state machine · collapse the two burst flags into one `burst: { reload, rearm }` swapped in `checkAfterBurst`.
- `src/main/adapters/pin-file-store.ts` `[tests]` · Timeout paths untested (hung `mkdir` rejects open; hung read keeps last pins with error) · new test file with `vi.mock('node:fs/promises')` + fake timers.
- `src/main/adapters/pin-file-store.ts` `[tests]` · "exactly one live watcher" unguarded · spy on `watch`, recreate the dir twice, assert open − closed = 1.
- `src/main/adapters/with-timeout.test.ts` `[tests]` · timer clearing not asserted · `expect(vi.getTimerCount()).toBe(0)` after resolve/reject.

## 🔵 Nice to Have
- `src/main/adapters/pin-file-store.ts:140` `[design|correctness]` · a file named like its directory triggers a harmless extra re-arm · one-line comment.
- `src/main/adapters/file-probe-timeout.test.ts:16` `[tests]` · assert not settled at 1999 ms to pin the 2 s limit.
- `src/main/adapters/pin-file-store.test.ts:139` `[tests]` · fixed 300 ms sleep relies on inotify timing; it does catch the bug — keep, revisit if flaky.

## ⚪ Disagree / Intentional
- `src/main/adapters/pin-file-store.ts` `[correctness]` · "store can notify after close()" — `notify()` already returns when `closed` (first line); no change.
- `src/main/adapters/with-timeout.ts` `[design]` · not over-engineered: two callers, real boundary helper.

## Per-dimension summary
- Design: no over-engineering; one SRP split, flag simplification, and the rejection hot loop.
- Docs: diagrams 07/08/11 match except the "30 s retry" wording (fixed by the timer).
- Tests: healthy pyramid, no over-mocking; one false-confidence test and missing timeout/dispose/watcher-count cases.
- Security: nothing found (paths only in error labels, no shell).
- Correctness: one Must (rejection loop), two Should (no timed retry, dead store after failed re-arm).
