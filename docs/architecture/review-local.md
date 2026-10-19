# Local review — dock-n-roll (branch diff main...chore/types-node-electron-align)

- Date: 2026-10-19
- Commit: working tree on top of 36e6a37
- Scope: branch diff `main...HEAD` — `package.json`, `pnpm-lock.yaml`, `.github/dependabot.yml`
- Checks run: design · docs · tests · security · correctness (inline, proportional: no source code changed)
- Verdict: **ship as-is** · Must 0 · Should 0 · Nice 1

## Pre-merge gate (head = working tree on 36e6a37)
| Step | Result |
|---|---|
| 1 Tests | ✅ 545 unit/integration (34 files) · ✅ E2E smoke 8/8 on `electron-builder --linux dir` |
| 2 Coverage | tests 97.12 % stmts / 92.04 % branches / 97.58 % funcs / 98.44 % lines (floors 90/85/90/90) · docs: no code changed |
| 3 SonarQube | ✅ PASSED (new coverage 97.5, duplication 0.0, new violations 0) |
| 4 Secrets | ✅ gitleaks clean · no tracked .env · diff read: nothing sensitive |
| 5 QA pass | ✅ smoke only (tooling diff): app starts, `app://` dashboard renders, no console or CSP error |
- Gate: **GREEN — merge authorised**

## 🔴 Must Have
_None._

## 🟡 Should Have
_None._

## 🔵 Nice to Have
- `package.json` `[correctness]` · `engines.node` is `>=22.12.0` while `@types/node` is now 24: build-time
  scripts (`electron.vite.config.ts`, `e2e/smoke.mjs`) could use a Node 24-only API without the
  typecheck noticing on a Node 22 host · raise `engines.node` to `>=24` when the CI runner and the
  owner's machine are on Node 24 (follow-up issue).

## ⚪ Disagree / Intentional
- `package.json` `[correctness]` · `@types/node` 24 rather than the roadmap's 26 · Electron 44 bundles
  Node 24.21.0 (`process.versions.node`); typing 26 would allow APIs missing at runtime · owner MCDA
  2026-10-19 (500 vs 350).

## Per-dimension summary
- Design: no structure touched · Docs: Dependabot ignore rule carries its rationale inline · Tests: no
  test change needed, typecheck is the guard · Security: version pinned exactly, 18 days old, lockfile
  only swaps the `@types/node` peer · Correctness: typecheck and all suites green against Node 24 types.
