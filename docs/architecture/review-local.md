# Local review — dock-n-roll (chore/sonar-mechanical-smells)

- Date: 2026-10-22
- Commit: 74c22e6 (+ env.d.ts comment)
- Scope: branch diff origin/main...HEAD (#30, part 1: mechanical Sonar smells)
- Checks run: design · docs · tests · security · correctness
- Verdict: ship as-is  ·  Must 0 · Should 1 (applied) · Nice 3

## Pre-merge gate (head SHA 74c22e6)
| Step | Result |
|---|---|
| 1 Tests | ✅ 589 unit/integration · ✅ packaged E2E smoke 8/8 (+ fuse check) |
| 2 Coverage | vitest thresholds 90/85/90/90 met · Sonar new coverage 97.2 % · docs: no new public API |
| 3 SonarQube | ✅ PASSED (new_violations 0, duplication 0.0 %); open issues 27 → 4 (the PR2 set) |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · no tracked .env · diff read: nothing sensitive |
| 5 QA pass | ✅ smoke only: behaviour-preserving refactor, no UI change; packaged app boots, dashboard renders, no console/CSP error |
- Gate: **GREEN — merge authorised**

## 🔴 Must Have
_None._

## 🟡 Should Have
- `src/renderer/src/env.d.ts:5` `[design|docs]` · `var dockNRoll` (needed for `globalThis`) loses `readonly` · applied: comment states nothing assigns it.

## 🔵 Nice to Have
- `src/renderer/src/components/RunningTab.tsx:28` `[correctness]` · `error_` name is what Sonar S7718 asks for · kept.
- `src/main/trusted-sender.ts:29` `[docs]` · null frame now implicit in `frame?.parent !== null` · the function doc already says a missing frame is refused.
- `src/main/adapters/autostart.ts:14` `[design]` · `'\\' + char` vs template · kept: a template there is what S4624 flagged.

## ⚪ Disagree / Intentional
- `src/main/controller/service-controller.ts:240,496` `[correctness]` · deleting from `probing` while iterating its keys · Map iteration is spec-safe under deletion and the cancel callback only cancels a timer, never re-adds.
- `src/shared/ipc.ts:65` and ADRs mention `window.dockNRoll` · `window` is the global object; docs describe the runtime surface.

## Per-dimension summary
- Design: no change of structure · Docs: one comment added · Tests: existing tests cover every rewritten line · Security: nothing new · Correctness: all rewrites equivalent.
