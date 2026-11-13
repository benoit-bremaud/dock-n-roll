# Local review — dock-n-roll (#121)

- Date: 2026-11-13
- Commit: 9c9f2a0
- Scope: branch diff origin/main...HEAD (`--push`): bump typos 1.52.0 to 1.52.2 in `mise.toml` and `mise.lock`
- Checks run: adversarial (Opus, 1 round) · design, docs, tests, security, correctness not run (two-line version pin, no code)
- Verdict: ship — Must 0 · Should 1 (recorded exception) · Nice 0

## Adversarial review (#236)
- Round 1 on `9c9f2a0`: Must 0 · Should 1 · Nice 0 · unverified 0 · **Push gate: open**
- Round 2: not needed, round 1 open

## Pre-push gate
`mise x -- just check` green on `9c9f2a0`: 660 tests, coverage 97.33 / 92.81 / 97.95 / 98.6 %, Semgrep 0, audit 2 moderate (below the high threshold), gitleaks clean. SonarQube, smoke and doc coverage are deferred to the pre-merge `just gate`.

## 🟡 Should Have
- `mise.toml:16` `[adversarial]` · typos 1.52.2 was published 2026-11-11, so it is 2 days old and skips the 5-day cooldown of `.github/dependabot.yml` · recorded exception in the PR and `PROJECT_LOG.md`: the nightly fails on drift, the seven `mise.lock` checksums match GitHub's digests, typos is a dev-only linter.

## Follow-up (out of scope)
- `justfile:148-150` · the nightly fails on any newer release, which pushes bumps to day 0 against the cooldown · follow-up issue.
