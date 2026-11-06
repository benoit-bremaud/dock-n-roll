# Local review — dock-n-roll (#99)

- Date: 2026-11-06
- Commit: 039fa53
- Scope: branch diff origin/main...feat/99-pin-match-project-name (`--push`)
- Checks run: adversarial (Opus, 2 rounds) · design · docs · tests · security · correctness
- Verdict: ship as-is · Must 0 · Should 0 · Nice 2

## Adversarial review (#236)

- Round 1 on `4686dd8`: Must 3 · Should 3 · Nice 2 · unverified 0 · Push gate: closed
- Round 2 on `039fa53`: 8 fixed · 0 not fixed · 0 regressed · new Must 0 · **Push gate: open**
- Hosted reviewers (filled at the pre-merge run): Copilot pending (422, not a collaborator) · Codex pending

## Pre-merge gate (head SHA 039fa53)

| Step | Result |
|---|---|
| 0 CI mirror | ✅ lint · typecheck · test:coverage · build; dist + `e2e:smoke` on `ee4d0a9` (later commits: docs, tests, one message string) |
| 1 Tests | ✅ 636 unit/integration |
| 2 Coverage | ✅ runner thresholds (90/85/90/90) passed · docs ⏸ deferred to the pre-merge run (`--push`) |
| 3 SonarQube | ⏸ deferred to the pre-merge run (`--push`) |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · no tracked .env · diff read: nothing sensitive |
| 5 E2E/smoke | ✅ `e2e:smoke` on the packaged build (Xvfb) · manual QA: pin at dir `a` with `project: qa99`, stack run from dir `b` → one row "QA99 pinned", on |

- Gate: `--push`: **pre-push green** — Sonar and doc coverage deferred (never GREEN)

## 🔴 Must Have

_None._ (Round 1: breaking change not marked → `feat(pins)!` + footer + CHANGELOG migration, owner MCDA A 460; Start-dir wording false → aligned in 5 places + test; stale never-started conflict rule copies → reworded.)

## 🟡 Should Have

_None._ (Round 1: lost invalid-copy test, `isCoveredBy` comment, dir-only duplicate message — fixed.)

## 🔵 Nice to Have

- `src/main/domain/service-catalog.ts:96-98` `[adversarial]` · the #99 comment line splits a sentence · move it after the sentence (folded into the #98 branch).
- `CHANGELOG.md:30-35`, `docs/architecture/decisions/0003-service-discovery.md:26,42`, `src/main/domain/types.ts:60` `[adversarial]` · over-long lines · reflow (folded into the #98 branch).

## ⚪ Disagree / Intentional

- `docs/architecture/decisions/0003-service-discovery.md` `[adversarial]` · a hidden project pin hides that project in every dir · owner MCDA (#99 option A).

## Per-dimension summary

- Adversarial: 3 Must in round 1, all fixed in round 2 · Design: two-rule `findPin`, no new abstraction · Docs: ADR-0003 amended, spec §8, class diagram, README, CHANGELOG · Tests: 6 new catalog cases + 1 pin-file case · Security: no new input path · Correctness: consumers use `service.workingDir`; ids and pending keys unchanged.
- Out of scope (pre-existing): `PinEntry` class box lacks `groups`; no tray action to remove stopped containers of a deleted worktree.
