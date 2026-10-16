# Local review — dock-n-roll (brick C, E2E smoke of the packaged app)

- Date: 2026-10-16
- Commit: 7a35d60
- Scope: branch diff origin/main...test/e2e-smoke
- Checks run: design · docs · tests · security · correctness
- Verdict: ship (Must applied) · Must 2 · Should 4 · Nice 4

## Pre-merge gate (head SHA 7a35d60)
| Step | Result |
|---|---|
| 1 Tests | ✅ 532 unit/integration (vitest) · ✅ E2E smoke 8/8 on the unpacked build (5 local runs) |
| 2 Coverage | tests 98.2 % lines / 91.7 % branches / 97.3 % funcs (floor 90/85/90/90) · docs: no new public API |
| 3 SonarQube | ✅ PASSED (new coverage 97.0, duplication 0.0, new violations 0) |
| 4 Secrets | ✅ gitleaks clean (all history) · no tracked .env · diff read: nothing sensitive |
| 5 QA pass | ✅ the smoke is the QA pass: packaged binary, scratch config, dashboard opened via a second instance, console clean |
- Gate: **GREEN for push**; merge after CI green on the PR (first CI run of the smoke step)

## 🔴 Must Have
- `e2e/smoke.mjs` `[correctness|tests]` · the second instance was not stopped when an assertion failed · fixed: `stop()` both instances in `finally` (7a35d60)
- `e2e/smoke.mjs` `[correctness]` · an app crash surfaced as a 30 s connection timeout · fixed: `failOnExit()` raced against the connection and the page wait (7a35d60)

## 🟡 Should Have
- `e2e/smoke.mjs` `[tests]` · a 404 could come from a failed fetch · fixed: the dashboard page must answer 200 first
- `e2e/smoke.mjs` `[tests]` · a hang blocked until the CI job timeout · fixed: global 90 s timeout
- `.github/workflows/ci.yml` `[security]` · `apparmor_restrict_unprivileged_userns=0` on the runner · kept: ephemeral GitHub runner, the unpacked build has no AppArmor profile, `--no-sandbox` would test another configuration
- `e2e/smoke.mjs` `[tests]` · `#root > *` accepts any rendered child · kept: the smoke checks the wiring (ADR-0010); the views are unit-tested

## 🔵 Nice to Have
- `eslint.config.mjs` `[design]` · hand-written globals instead of the `globals` package · kept: no new dependency for five names
- `e2e/smoke.mjs` `[design]` · `freePort()` has a small race window · accepted
- `e2e/smoke.mjs` `[design]` · app logs interleave with `ok -` lines · kept: the logs help when CI fails
- `e2e/smoke.mjs` `[tests]` · `getState()` result shape not asserted · kept: `null` before the first Docker sync is a valid answer

## ⚪ Disagree / Intentional
- `e2e/smoke.mjs` `[tests]` · "the dashboard may already be open before the page wait" · the app starts as a tray only (diagram 11); the dashboard opens on the second instance, as the smoke asserts

## Per-dimension summary
- Design: one script, two dev dependencies, no abstraction · Docs: ADR-0010 and diagram 10 match the script · Tests: one E2E at the top of the pyramid, fail-fast and cleanup now covered · Security: debugging port only in the smoke, on loopback; fuses unchanged · Correctness: process lifecycle fixed
