# Local review — dock-n-roll (branch chore/72-sonar-new-rules)

- Date: 2026-10-23
- Commit: a065fb0
- Scope: branch diff origin/main...HEAD (issue #72)
- Checks run: design · docs · tests · security · correctness
- Verdict: ship as-is · Must 0 · Should 0 · Nice 3

## Pre-merge gate (head SHA a065fb0)
| Step | Result |
|---|---|
| 1 Tests | ✅ 599 unit/integration · ✅ 8/8 E2E smoke on the packaged build |
| 2 Coverage | tests 97.13 % stmts / 92.51 % branches (thresholds 90/85/90/90 met) |
| 3 SonarQube | ✅ PASSED, 0 open issues (the 5 issues from the 26.10 rules are closed) |
| 4 Secrets | ✅ gitleaks clean · no tracked .env · diff read: nothing sensitive |
| 5 QA pass | ✅ packaged E2E smoke (ADR-0010): console clean, app:// 200, traversal 404 |
- Gate: **GREEN — merge authorised**

## 🔴 Must Have
_None._

## 🟡 Should Have
_None._

## 🔵 Nice to Have
- `src/main/domain/port-join.ts:10` `[correctness]` · `Math.max(start, end)` can never change the result: a string that starts with `[` and ends with `]` has at least two characters · it can be dropped.
- `src/main/domain/port-join.ts:11` `[correctness]` · `indexOf('%')` also cuts after a newline, which the old `/%.*$/` did not · `ss` addresses never contain one, so behaviour is unchanged in practice.
- `src/main/adapters/pin-file-store.ts:80`, `src/main/adapters/docker-observer.ts:262` `[design]` · `NOSONAR` silences every rule on the line, not only S9382 · accepted (owner MCDA A 500): the rule key and the reason are written next to it.

## ⚪ Disagree / Intentional
- The sequential awaits (S9382) are kept on purpose: each read depends on the previous offset, and the inspections stop as soon as a newer sync starts.

## Per-dimension summary
- Design: minimal string scans, no new abstraction. · Docs: the NOSONAR markers carry their reason. · Tests: the pinning tests pass before and after the fix. · Security: linear scans, the backtracking is gone. · Correctness: behaviour unchanged.
