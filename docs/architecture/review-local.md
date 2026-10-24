# Local review — dock-n-roll (branch chore/52-vite8-lockstep)

- Date: 2026-10-24
- Commit: 4e76e67
- Scope: branch diff origin/main...HEAD (issue #52) — `package.json` + `pnpm-lock.yaml` only
- Checks run: security (lockfile read) · correctness (build output) · design/docs/tests n/a (no source change)
- Verdict: ship as-is · Must 0 · Should 0 (1 pre-existing → #82) · Nice 1

## Pre-merge gate (head SHA 4e76e67)
| Step | Result |
|---|---|
| 1 Tests | ✅ 625 unit/integration · ✅ 9/9 E2E smoke on the packaged build (`electron-builder --linux dir`) |
| 2 Coverage | tests 97.23 % stmts / 92.85 % branches / 97.65 % funcs / 98.52 % lines (floor 80, runner gate 90/85/90/90) · docs unchanged (no source diff) |
| 3 SonarQube | ✅ PASSED (new_coverage 97.7, duplication 0.0, violations 0) |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · no tracked .env · diff read: version bumps only, all tarballs from registry.npmjs.org |
| 5 QA pass | ✅ pass · inspector clean (console 0, network 3 × 200 app://) · CSP enforced, sandbox + contextIsolation intact, app:// traversal 404 ×7 · domains FON, UI, A11Y, SEC · finding → #82 (pre-existing) · report: docs/architecture/qa/2026-10-24-vite8-lockstep.md |
- Gate: **GREEN — merge authorised** once electron-vite 6.0.0 reaches the 2-week age rule (2026-10-28, owner MCDA A 470)

## 🔴 Must Have
_None._

## 🟡 Should Have
_None from this diff._ (Pre-existing: empty Logs panel on a silent running service → #82.)

## 🔵 Nice to Have
- `out/main/index.js` `[correctness]` · Rolldown keeps source comments in the main bundle (+16 kB), no security impact · no action

## ⚪ Disagree / Intentional
- `pnpm-workspace.yaml` `[security]` · `allowBuilds.esbuild` kept: esbuild is still an optional peer of vite 8 in the tree · undici/zod overrides kept (parents unchanged)
- `pnpm audit` `[security]` · `fast-uri@3.1.8` 2 moderate / 2 low via electron-builder, dev-only, same as main, below the `high` gate

## Per-dimension summary
- Design: n/a (no source) · Docs: n/a · Tests: suite unchanged, 625 green · Security: CSP-strict bundle, no new high advisory · Correctness: renderer gzip −4 %, CSS identical, preload still CJS
