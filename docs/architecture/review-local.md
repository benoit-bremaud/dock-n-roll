# Local review — dock-n-roll (test/nice-findings-brick-d)

- Date: 2026-10-22
- Commit: e924d19
- Scope: branch diff origin/main...HEAD (#25: test Nice findings from the brick D review, test-only)
- Checks run: design · docs · tests · security · correctness
- Verdict: ship as-is  ·  Must 0 · Should 0 (1 applied) · Nice 2

## Pre-merge gate (head SHA e924d19)
| Step | Result |
|---|---|
| 1 Tests | ✅ 592 unit/integration · ✅ packaged E2E smoke 8/8 |
| 2 Coverage | tests 97.18 % stmts / 92.55 % branches / 97.49 % funcs / 98.46 % lines (thresholds 90/85/90/90) · docs: no public API change |
| 3 SonarQube | ❌ FAILED: `new_violations` 2. All 5 open issues come from new rules (S8786, S9381, S9382) in files this diff does not touch (`port-join.ts`, `format.ts`, `pin-file-store.ts`, `docker-observer.ts`, `index.ts`). Filed as a follow-up, outside #25 |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · no tracked .env · diff read: nothing sensitive |
| 5 QA pass | ✅ smoke only (test-only diff): packaged app, console and CSP clean |
- Gate: **RED on SonarQube only, for issues outside the diff.** The owner decides whether to merge.

Mutation checks: `DEBOUNCE_MS = 101` fails 5 tests, and a structural sender comparison fails the new clone test.

## 🔴 Must Have
_None._

## 🟡 Should Have
- `src/main/ipc.test.ts:19` `[docs|tests]` · the comment said that production `isTrusted` compares by identity, but only the stub does · **applied** (e924d19)

## 🔵 Nice to Have
- `src/main/adapters/pin-file-store-fs.test.ts:153` `[tests]` · import `DEBOUNCE_MS` rather than repeating 100 · the issue allowed either; the mutation check covers drift
- `src/main/adapters/docker-observer.test.ts:256` `[tests]` · `quietFor` waits in real time; fake timers would make it faster · existing design, documented at `quietFor`

## ⚪ Disagree / Intentional
- `src/main/ipc.test.ts:20-27` `[tests]` · `{} satisfies Partial<X> as X` checks little for `{}` · this is exactly what #25 asked for, and it is still stricter than `as unknown as`

## Per-dimension summary
- Design: no change · Docs: one inaccurate comment, fixed · Tests: stronger (identity and the exact debounce are now pinned) · Security: nothing · Correctness: nothing
