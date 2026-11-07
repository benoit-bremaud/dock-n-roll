# 0011 — Local-first CI: every check on the machine, no GitHub workflow

- **Status**: accepted
- **Date**: 2026-11-07
- **Related**: issue #115, [ADR-0004](0004-react-renderer-and-scaffold.md) (CI baseline, superseded
  here), [ADR-0010](0010-e2e-smoke-over-cdp.md) (the smoke now runs in the local gate),
  agents-skills ADR-0003 (gate attestation) and ADR-0004 (production from signed tags)

## Context and problem statement

GitHub Actions on the owner's personal account is billed for private repositories, and the
owner decided on 2026-11-07 that every project follows one model: every check runs locally,
GitHub Actions is reserved for a production deploy on a signed release tag (agents-skills #210,
#259). This repository is public, so its minutes are free, but the policy applies anyway. Over
2026-10-01 → 2026-11-07 its three workflows (`ci.yml`, `dependency-audit.yml`, `gitleaks.yml`) ran
389 times for 379 minutes (409 / 420 with GitHub's own Dependabot runs), and the 7-day `.deb`
artifact of every CI run peaked at 134 GB·h of storage a day (measurements on #115).

## Decision 1 — the checks move to the local CI (skill `local-ci`)

Four tiers, one `just` recipe each, tools pinned in `mise.toml` (`mise.lock` holds the checksums),
hooks by lefthook, no agent needed:

| Tier | Recipe | Trigger | Holds |
|---|---|---|---|
| L0 | `just fast` | pre-commit hook (the commit-msg hook adds the Conventional Commits subject check) | staged files: gitleaks, eslint, typos, shellcheck |
| L1 | `just check` | pre-push, `review-local --push` | eslint, tsc, the electron-vite bundle, typos, shellcheck, `lefthook validate`; vitest with the coverage floor of ADR-0007; the wiring and attestation tests; Semgrep CE (`p/javascript`, `p/typescript`, `p/react`); `pnpm audit --audit-level=high`; gitleaks on the full history |
| L2 | `just gate` | before every merge, on the pushed head, which must contain `base` (`origin/main`): a PR takes `main` in before its gate | `check`, SonarQube quality gate (global analysis token), `pnpm dist` + E2E smoke of the unpacked build under Xvfb (ADR-0010), then `scripts/attest.sh write gate`: a signed note on `refs/notes/gate` and the commit status `gate` |
| L3 | `just nightly` | systemd user timer, 04:40 (+ up to 10 min; catches up after the PC was off) | `check`, Trivy fs on the lockfile, TruffleHog on the history, toolchain drift (`mise outdated --bump`, failing on any `mise.toml` row but Node and pnpm, pinned to `.nvmrc` and `packageManager`) |

`just merge <pr>` refuses a head SHA without a verified attestation and merges with a merge commit
(stacked PRs, PROJECT_LOG decision of 2026-10-09); the trust store is `.github/allowed_signers`
read from `origin/main`. Bootstrap: this PR itself cannot be verified against `origin/main` (no
trust store there yet), so it merges through `gh pr merge --merge --match-head-commit` on the
owner's explicit yes, after the full gate ran on its head; every later merge goes through
`just merge`. Nothing deploys, so there is no `deploy`,
`attest staging` or `seed` recipe (skill `local-ci` rule 1).

## Decision 2 — no GitHub workflow at all (MCDA, owner choice C)

The product is a `.deb` the owner builds (`pnpm dist`) and installs; the two existing releases
carry no asset and no download is expected. Weights: conformity with agents-skills ADR-0004 25,
real install flow 25, reproducibility of a published artefact 20, minutes and storage 15,
maintenance 15.

| Option | Total /500 |
|---|---|
| A — no workflow, `just release <tag>` builds the `.deb` locally and attaches it to the GitHub release | 385 |
| B — `prod.yml` on a signed stable tag: runner build, smoke, release asset | 380 |
| **C — no workflow; a release is a signed tag plus the CHANGELOG notes; `.deb` built locally** | **410** |

Sensitivity: C stays first while reproducibility weighs 30 or less; at 35, B leads (415 vs 410).
B is worth it only when the `.deb` is distributed to others; it is filed as issue #116.

## Decision outcome

- `.github/workflows/` is empty: GitHub Actions is reserved for a future `prod.yml` publishing the
  `.deb` on a signed release tag (skill `release-tag` § Prod workflow). Dependabot keeps the npm
  ecosystem only.
- Release tags are SSH-signed from now on (`tag.gpgsign`); `.github/allowed_signers` holds the
  owner's key. The tags before this ADR stay unsigned (immutable).
- `pnpm sonar` is replaced by `just sonar`, which uses the machine's global analysis token.

### Consequences

- Good: zero Actions minutes and storage; the gate runs with GitHub down; one toolchain for the
  hooks, the agent review and the owner.
- Bad: the checks depend on the developer's machine (Xvfb, Docker optional, SonarQube at
  localhost:9000, Node 22 through mise); a fresh clone needs `just setup`. Mitigated by the pinned
  `mise.toml`, the Node guard and the wiring tests of `scripts/test-local-ci.sh`.
- Bad: a PR shows no check on GitHub except the `gate` status written by the attestation; the
  branch protection, if any, must require `gate` only.
- Bad: the nightly runs in the owner's checkout, on whatever branch it has out; it watches the
  lockfile and the history, which rarely differ from `main`, so this is accepted.
