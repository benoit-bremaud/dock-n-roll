# Local review — dock-n-roll (fix/95-disable-spellchecker)

Pre-push review of the #95 fix that stops the Chromium spellcheck dictionary download on launch.

- Date: 2026-11-06
- Commit: a8b0356 + net-log completeness fix
- Scope: branch diff origin/main...HEAD
- Checks run: adversarial (Opus, 2 rounds) · design/tests/docs (architecture-guardian) · security and correctness (adversarial + diff read)
- Verdict: ship as-is · Must 0 · Should 0 open · Nice 3 open

## Adversarial review (#236)
- Round 1 on `5d40a4e`: Must 0 · Should 2 · Nice 3 · unverified 1 · Push gate: open
- Round 2 on `629edc2`: 3 fixed · 1 partly fixed (module name, accepted) · 1 not fixed (Nice, docs) · new Must 0 · new Should 2 (fixed in `b26cece`) · Push gate: open
- Round 3 on `a8b0356` (net-log check after Codex): all prior findings fixed · new Must 0 · new Should 2 (net log must be complete JSON; this report refreshed), both fixed · **Push gate: open**. Note: `b26cece` and `a8b0356` were pushed before their verify round; it found no Must.
- Hosted reviewers (filled at the pre-merge run): Copilot pending · Codex reviewed `3192976` (1 P2: detect the request, not the file — fixed in `a8b0356`, thread resolved)

## Pre-merge gate (head SHA b26cece)
| Step | Result |
|---|---|
| 0 CI mirror | ✅ ci.yml: lint, typecheck, test:coverage, build, dist + `xvfb-run -a pnpm e2e:smoke` · dependency-audit.yml: `pnpm audit --audit-level=high` · gitleaks.yml: gitleaks |
| 1 Tests | ✅ 630 unit/integration · ✅ E2E smoke on the packaged build (net-log check: red without `setSpellCheckerLanguages([])`, green with it; a truncated log fails) |
| 2 Coverage | tests 97.25 % stmts / 92.85 % branches / 97.66 % funcs / 98.52 % lines (thresholds 90/85/90/90) · docs ⏸ deferred to the pre-merge run |
| 3 SonarQube | ⏸ deferred to the pre-merge run (`--push`) |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · no tracked .env · diff read: nothing sensitive (no request URL or IP committed) |
| 5 E2E/smoke | ✅ smoke on the local packaged build · QA pass: on the installed build after merge |
- Gate: `--push`: **pre-push green** — SonarQube and doc coverage deferred (never GREEN)

## 🔴 Must Have
_None._

## 🟡 Should Have
_None open._ Fixed: CI guard on the request itself via Chromium's net log (`e2e/smoke.mjs`), completeness of that log, ADR-0010 assertion list.

## 🔵 Nice to Have
- `docs/architecture/diagrams/launcher/11-sequence-startup.md:24` `[adversarial]` · startup sequence does not show `hardenSession(defaultSession)`; spec R4 does not state "no outbound request of its own at launch" · file an issue.
- `src/main/session-hardening.ts:24` `[design|adversarial]` · `DASHBOARD_WEB_PREFERENCES` is window-level in a `session-` module · JSDoc now explains it; rename optional.
- `src/main/session-hardening.test.ts:28` `[design]` · one test checks both permission handlers with `@ts-expect-error` · split with `it.each` and a typed cast.

## ⚪ Disagree / Intentional
- `src/main/session-hardening.ts:15-16` `[adversarial]` · both `setSpellCheckerLanguages([])` and `setSpellCheckerEnabled(false)` kept, plus `spellcheck: false`: defense in depth, one line each.
- `src/main/session-hardening.ts:4` `[design]` · `HardenableSession` structural type: testability seam, precedent `trusted-sender.ts` (`index.ts` excluded from coverage, ADR-0007).

## Per-dimension summary
- Adversarial: no Must; CI guard added after round 1. · Design: flat, no over-engineering. · Docs: exports documented with the why. · Tests: boundary-only fakes, each line guarded. · Security: permissions and isolation unchanged, no secret. · Correctness: preferences unchanged apart from `spellcheck: false`.
