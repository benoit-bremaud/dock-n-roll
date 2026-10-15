# Local review — dock-n-roll (brick D: test quality)

- Date: 2026-10-15
- Commit: 9a0f240
- Scope: branch diff main...test/brick-d-test-quality
- Checks run: design · docs · tests · security · correctness
- Verdict: ship after Should fixes  ·  Must 0 · Should 6 · Nice 6 (all Should applied)

## 🔴 Must Have

_None._

## 🟡 Should Have

- `src/main/trusted-sender.ts:22` `[design|security]` · The dev-server check is a string prefix:
  `http://localhost:5173` also accepts `http://localhost:51730/` or `http://localhost:5173.evil.com/`
  (dev builds only; same as before the extraction) · Compare URL origins; add the port-prefix case.
- `src/main/trusted-sender.ts:19`, `src/main/index.ts:162` `[design|docs|security]` · `dashboard:
  unknown` is the window's `webContents`, not the window, and the contract is unstated; reading
  `webContents` of a destroyed window throws, so an in-flight call during quit rejects instead of
  being refused · Rename to `dashboardContents`, document it, pass `null` for a destroyed window.
- `src/main/adapters/docker-observer.test.ts:209` `[docs|tests]` · `quietFor(20)` is used for a
  positive timing need (split chunks), breaking the helper's "negative checks only" contract ·
  Plain delay with a WHY comment.
- `docs/architecture/decisions/0007-*.md:17`, `vitest.config.ts:9` `[docs]` · "minus ~5 points"
  is really 5.6–8.2 points · Say "rounded down to a multiple of 5, 5–8 points under".
- `src/main/adapters/docker-observer.test.ts:293` `[tests]` · The stale-answer test only checks
  the last snapshot; a wrong intermediate publish later corrected would stay green · Assert `db`
  is running in every snapshot published after the resync.
- `src/main/index.ts:162` `[tests]` · The wiring of `isTrustedSender` (live window + origin) is
  not covered by any automated test (composition root excluded) · Record the gap in ADR-0007:
  covered by the manual test of the built app.

## 🔵 Nice to Have

- `src/main/trusted-sender.test.ts:4` `[security]` · Add a structural clone of the dashboard that
  must be refused (pins identity comparison).
- `src/main/adapters/pin-file-store-fs.test.ts:114` `[tests|correctness]` · Pin the debounce at
  exactly 100 ms (99 then 1), or import the constant.
- `src/main/adapters/docker-observer.test.ts:255,293` `[docs|correctness]` · WHY comment on
  `quietFor(100)`; explain the `=== 3` request count.
- `src/main/ipc.test.ts:18` `[design]` · Fakes via `satisfies Partial<…>` instead of
  `as unknown as`.
- `vitest.config.ts` `[design]` · One coverage exclude per line.
- `src/preload/index.test.ts:51` `[tests]` · Rename to "forwards the answer".

## ⚪ Disagree / Intentional

- `docker-observer.test.ts` `quietFor` negative windows `[design|tests]` · Can only pass wrongly
  on a slow runner, never fail wrongly · ADR-0007.
- `vitest.config.ts` exclusion of `index.ts` / `main.tsx` `[design]` · Composition roots, manual
  test of the built app · ADR-0007.
- Redundant `closed` guards in the pin store (timer cleared, `checkAfterBurst`, `notify`) mean a
  single guard removal is not caught by the close tests `[tests]` · Defence in depth; the tests
  pin the outcome.
- `waitFor` wrapper duplicated in two test files `[design]` · Below the rule of three.

## Per-dimension summary

- Design: right seam, no over-engineering; dev-server prefix check and loose param type.
- Docs: public surface documented; `quietFor` contract and "~5 points" inaccurate.
- Tests: trustworthy, boundaries-only mocks; stale-answer test hardened; wiring gap documented.
- Security: behaviour identical to main; prefix check and destroyed-window throw fixed.
- Correctness: CI, pinned coverage-v8 5.0.3 = vitest 5.0.3, gitignore and excludes fine.
