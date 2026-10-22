# Local review — dock-n-roll (chore/sonar-logic-smells)

- Date: 2026-10-22
- Commit: 43a425c
- Scope: branch diff chore/sonar-mechanical-smells...HEAD (#30, part 2: logic and a11y Sonar smells)
- Checks run: design · docs · tests · security · correctness
- Verdict: ship as-is  ·  Must 0 · Should 2 (applied) · Nice 2 (1 applied)

## Pre-merge gate (head SHA 43a425c)
| Step | Result |
|---|---|
| 1 Tests | ✅ 591 unit/integration · ✅ packaged E2E smoke 8/8 (+ fuse check) |
| 2 Coverage | vitest thresholds 90/85/90/90 met · Sonar new coverage 97.1 % · new functions documented |
| 3 SonarQube | ✅ PASSED (new_violations 0, duplication 0.0 %); open issues 4 → **0** |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · no tracked .env · diff read: nothing sensitive |
| 5 QA pass | ✅ packaged app: focus Services, ArrowRight → Running selected and focused, Home → Services, End → Running; console clean · `docs/architecture/qa/2026-10-22-tabs-keyboard.png` |
- Gate: **GREEN — merge authorised**

## 🔴 Must Have
_None._

## 🟡 Should Have
- `src/main/controller/background-monitor.ts:7` `[docs]` · UC4 JSDoc ended up on `projectNameOf` · applied: moved back above `listBackground`.
- `src/renderer/src/App.test.tsx` `[tests]` · with two tabs, ArrowLeft wrap and End land on the same tab · applied: ArrowRight wrap from the last tab asserted too.

## 🔵 Nice to Have
- `src/main/index.ts:216` `[tests]` · enable/disable dispatch untested · kept: `index.ts` is the composition root, excluded from coverage by design.
- `src/main/adapters/autostart.test.ts:5` `[design]` · import order · applied.

## ⚪ Disagree / Intentional
_None._

## Per-dimension summary
- Design: boolean-flag API split, helpers extracted · Docs: no stale `setAutostart` reference · Tests: 2 new behaviour tests · Security: nothing new · Correctness: behaviour preserved; keys typed inside the panels no longer reach the tab handler.
