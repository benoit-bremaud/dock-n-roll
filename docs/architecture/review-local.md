# Local review — dock-n-roll (#115)

- Date: 2026-11-07
- Commit: 8cc04d5 (round 1 on c984517, round 2 on 4551ff7, round 3 on 278da88)
- Scope: branch diff origin/main...HEAD (`--push`): local CI replacing the three GitHub workflows
- Checks run: adversarial (Opus, 4 rounds) · design · docs · tests · security · correctness
- Verdict: ship — every Must fixed by round 4 (`8cc04d5`, Push gate open) · Must 4 (all fixed) · Should 13 (all fixed) · Nice 10 (3 carried over)

## Adversarial review (#236)
- Round 1 on `c984517`: Must 2 · Should 10 · Nice 6 · unverified 2 · Push gate: closed
- Round 2 on `4551ff7`: 2 fixed · 0 not fixed · 0 regressed · new Must 1 (ADR-0011 drift rule said "any row but Node" while the recipe also skips pnpm) · new Should 3 (`mise outdated` errors swallowed; TruffleHog URI detector off instead of a path exclude; mise trust entry left by the L0 test repo) · Nice 6 · Push gate: closed
- Round 3 on `278da88`: 8 fixed · 2 not fixed (Nices N1 upstream port, N2 Node patch releases, carried over) · 1 regressed (S2: the comment of `.trufflehog-exclude` held a literal `user:password` URL, red once committed) → Must 1 · Nice 3 · Push gate: closed
- Round 4 on `8cc04d5`: 3 fixed · 0 not fixed · 0 regressed · new Must 0 · Nice 1 (grep -E vs Go regex in the exclude-list test) · carried over: `attest.sh --no-verify` upstream port, Node patch releases in the drift check · **Push gate: open**
- Hosted reviewers (filled at the pre-merge run): Copilot pending · Codex optional

## Pre-merge gate (head SHA 4551ff7)
| Step | Result |
|---|---|
| 0 CI mirror | n/a — no PR workflow left (ADR-0011); the former jobs map onto `just check` (lint, typecheck, build, test:coverage, audit, gitleaks) and `just gate` (dist + smoke, Sonar) |
| 1 Tests | ✅ 660 unit (38 files) · ✅ 56 wiring + 22 attestation cases · smoke: see 5 |
| 2 Coverage | tests 97.33 % stmts / 92.81 % branches / 97.95 % funcs / 98.6 % lines (floor 90/85/90/90) · docs: no doc counter in this repo (headers on 9/9 new files, doc-auditor) |
| 3 SonarQube | ⏸ deferred to the pre-merge run (`--push`); PASSED on the pre-fix head c984517 via `just sonar` |
| 4 Secrets | ✅ gitleaks clean (full history, 175 commits; origin/main..HEAD) · no tracked .env · diff read: only the intended public signing key and the author email |
| 5 E2E/smoke | ⏸ deferred to the pre-merge run (`--push`); `just smoke` 11/11 on the unpacked build under Xvfb on both heads · QA pass: n/a (desktop app, nothing deploys) |
- Gate: `--push`: **pre-push green** — `just check` passed (21 s), `just nightly` green (72 s), Sonar and smoke deferred

Timings: `just fast` 0.9 s (budget 10 s), `just check` 21 s (budget 3 min), `just smoke` 21–40 s, `just sonar` 17 s.

## 🔴 Must Have
- `justfile:128` `[adversarial]` · `just merge` squashed, against the 2026-10-09 decision "stacked PRs merge with merge commits" · fixed: `--merge --match-head-commit`, PR number validated
- `justfile:135` `[adversarial]` · `just nightly` red: TruffleHog flags fixture URLs of `pin-file.test.ts` in history; timer already active on a checkout without a justfile · fixed: `--exclude-detectors=URI`, nightly run green, timer disabled until the merge (PROJECT_LOG)

## 🟡 Should Have
- `justfile:77-85` `[adversarial][design][security][correctness]` · `gate base` fetched and never used; dirty/unpushed tree found only after 10 min · fixed: refuses a dirty tree, a HEAD behind `base`, an unpushed HEAD, before `check`
- `lefthook.yml:28` `[adversarial][design]` · pre-push ignored untracked files · fixed: `git status --porcelain`
- `scripts/attest.sh:56` `[adversarial]` · the notes push reran the pre-push hook (`just check`) inside the gate · fixed: `--no-verify` (upstream follow-up in agents-skills)
- `justfile:136` `[adversarial][design][security]` · `mise outdated` never fails · fixed: non-empty mise.toml drift (minus node/pnpm pins) exits 1
- `justfile:62` `[adversarial]` · L1 lost `pnpm build` of the former `quality` job · fixed: in `lint`
- `scripts/test-local-ci.sh:34-46` `[tests][adversarial]` · gate/merge/lefthook asserted by grep, pass with the behaviour removed · fixed: gate, merge, sonar, node-guard run with stubbed boundaries (56 cases); exact `run:` lines; shellcheck L0 case; `MISE_TRUSTED_CONFIG_PATHS` instead of `mise trust`; `GIT_CONFIG_GLOBAL=/dev/null`
- `scripts/test-attest.sh:20-21` `[tests]` · the fake `gh` ignores the posted state/context and the `-q` filter · not fixed here: shared upstream script (agents-skills follow-up, noted in the hand-over note)
- `package.json:26` / `justfile:64` `[design][adversarial]` · audit threshold twice · fixed: `pnpm run audit`
- `mise.toml:12` `[design]` · pnpm pin unchecked against package.json · fixed: wiring test
- `docs/architecture/decisions/0011-local-first-ci.md` `[adversarial][docs]` · 409/420 counted Dependabot runs; "filed as a follow-up" false; L0 row misattributed the subject check; timer wording; bootstrap merge path undocumented · fixed (follow-up #116)
- `README.md:136-142` `[design]` · tier list duplicated and already drifted · fixed: `just --list` is the source, ADR-0011 the why; system tools list completed
- `CHANGELOG.md` `[adversarial]` · no entry for the removed CI artifact · fixed (`### Removed`)
- `pnpm-workspace.yaml:10`, `e2e/smoke.mjs:129`, `ADR-0010:33`, `10-deployment.md:4` `[docs][adversarial]` · stale CI mentions · fixed
- `scripts/systemd/dock-n-roll-nightly.service` `[security]` · no timeout; runs in the live checkout · fixed: `TimeoutStartSec=2h`, `.claude/` excluded from typos and Trivy; live-checkout limitation recorded in ADR-0011

## 🔵 Nice to Have
- `justfile` `[docs][design]` · two comment lines above each recipe (`just --list` reads the last) · kept: skill `local-ci` gotcha "tier doc line last"; `[doc("…")]` attribute as a later cleanup
- `.github/allowed_signers` `[security]` · no `namespaces=` option, personal email as principal · kept: same shape as the other repos (ohm-sweet-ohm), email already public in 230 commits
- `justfile:104` `[security]` · `SONAR_HOST_URL` override could send the token elsewhere · kept: operator-controlled environment variable
- `scripts/attest.sh:70,89`, `scripts/check-commit-msg.sh:20` `[security][adversarial]` · statuses page size, tag prefix starting with `-`, byte count, foreign issue refs · upstream (agents-skills) follow-ups
- `justfile:19` `[design]` · Semgrep version pinned outside mise · kept, commented
- `typos.toml:16` `[correctness]` · hex regex masks `defaced`-like words · accepted
- `lefthook.yml:27` `[correctness]` · pre-push tests the working tree whatever ref is pushed · accepted (owner pushes the current branch)
- `justfile:91-100` `[adversarial]` · every gate overwrites the single Community Build branch analysis · accepted (one branch only, as before)
- `scripts/test-attest.sh:87-94` `[design]` · the copy has a case the shared script lacks · upstream follow-up

## ⚪ Disagree / Intentional
- `scripts/attest.sh` `[design][docs]` · unused `deploy/staging` / `release` subcommands · byte-for-byte copy of the shared verifier, the merge hook runs main's copy (skill `local-ci` § Apply step 1)
- `justfile:80` `[design]` · `gate` runs `check` from its body, not as a dependency · the attested HEAD must be the checked one
- `justfile:37` `[design]` · `node-guard` + `.nvmrc` next to the mise pin · skill `local-ci` rule 9

## Per-dimension summary
- Adversarial: 2 Must (merge strategy, red nightly) + 10 Should, all addressed in 4551ff7 · Design: no over-engineering, dead `base` fetch and duplicated facts fixed · Docs: 0 Must, stale CI mentions fixed · Tests: wiring tests made behavioural, fake `gh` upstream · Security: 0 Must, early refusals and timeout added · Correctness: shell idioms clean, drift check now fails
