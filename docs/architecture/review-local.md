# Local review — dock-n-roll (branch feat/77-service-groups)

- Date: 2026-10-24
- Commit: 121d37f (findings raised on 48b8872, fixed in 121d37f)
- Scope: branch diff origin/main...HEAD (issue #77)
- Checks run: design · docs · tests · security · correctness
- Verdict: ship — every Must and Should applied · Must 3 (fixed) · Should 9 (fixed) · Nice 5 (→ #80)

## Pre-merge gate (head SHA 121d37f)
| Step | Result |
|---|---|
| 1 Tests | ✅ 622 unit/integration · ✅ 9/9 E2E smoke on the packaged build (new: pin-file group shows the Groups menu) |
| 2 Coverage | tests 97.07 % stmts / 92.77 % branches / 97.38 % funcs / 98.35 % lines (floor 80; runner gate 90/85/90/90) · docs ≈ 90 % of the new public surface (doc-auditor estimate; undocumented ones follow the sibling `start`/`stop` convention) |
| 3 SonarQube | ✅ PASSED — new_coverage 97.6 %, new duplication 0.0 %, new violations 0; 0 open issues |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · no tracked .env · diff read: only temp paths under the scratchpad in QA screenshots, nothing sensitive |
| 5 QA pass | ✅ full, packaged build + real Docker: Start all QA (2 members up, Gamma untouched), Stop all demo (only Beta), Stop all QA; light + dark; console clean · screenshots: `docs/architecture/qa/2026-10-24-77-groups-{1-closed,2-open,3-qa-on,4-demo-stopped,5-dark}.png` |
| 5b Inspector pass (b991c01, CDP) | ✅ CSP meta (`script-src 'self'`, `object-src 'none'`), injected inline script blocked · no `require`/`process` in the page, `window.dockNRoll` frozen with the 12 expected methods · no request outside `app://` · native details/summary, per-group accessible names, no duplicate id · keyboard: Tab → Enter → first button, focus ring visible · contrast text ≥ 6.1:1, borders ≥ 6.1:1 (light and dark) · targets 73×30 px · 360 px wide fits · screenshots `-6-keyboard-focus`, `-7-narrow-360` · finding: open menu covering the list did not close on Escape / outside click → **fixed** (Should) |
- Gate: **GREEN — merge authorised** (pending CI and owner approval)

## 🔴 Must Have
- `docs/architecture/diagrams/groups/02-sequence-start-group.md:35` `[docs|design]` · note claimed `Promise.allSettled` while the code used `Promise.all` · **fixed**: code now uses `allSettled`, note explains why.
- `docs/architecture/diagrams/groups/02-sequence-start-group.md:22` `[docs|design]` · diagram filtered on `controls.start` in `runGroup`; the check lives in `claim` · **fixed**.
- `docs/architecture/specs/v1-spec.md` §5 `[docs]` · UC8 / UC9 cited but absent · **fixed**: UC8 / UC9 entry added.

## 🟡 Should Have
- `src/main/controller/service-controller.ts:485` `[correctness]` · `runGroup` read a stale `services`: a member whose id changes in the pending rebuild (never-started pin getting its first container) was silently skipped · **fixed**: `await chain` first; test proven red without it.
- `src/main/controller/service-controller.test.ts` `[tests]` · no test for Docker unavailable, hidden members; stop-skip test proved nothing; index-based assertion · **fixed**: 4 tests added / split.
- `src/renderer/src/App.test.tsx` `[tests]` · `arrayContaining` too loose · **fixed**: exact list.
- `src/main/ipc.test.ts` `[tests]` · group name validation only for `42` on one channel · **fixed**: `''`, `42`, `null`, 4096 chars on both.
- `docs/architecture/diagrams/groups/03-class.md` `[docs]` · `Service[]` instead of `ServiceView[]` · **fixed**.
- `docs/architecture/diagrams/launcher/01-use-case.md`, `07-class-controller.md` `[docs]` · no link to the groups extension · **fixed**.
- `src/main/domain/pin-file.ts` (`optionalGroups`) `[docs|design]` · all-or-nothing and `''` placeholder unexplained · **fixed**: comment.
- `src/shared/ipc.ts` (`DockNRollApi.startGroup`) `[docs]` · contract silent on unknown names and failures · **fixed**.
- spec §5 UC8 note `[correctness]` · a pin without `project` puts every project of its dir in its groups · **fixed**: documented (consistent with pins).

## 🔵 Nice to Have (filed as #80)
- `src/main/domain/pin-file.ts` `[correctness]` · no length cap on group names; `.groups__item` is `nowrap`.
- `README.md` `[docs]` · mention disabled while Docker is down, case-sensitive names.
- `src/main/controller/tray-and-background.test.ts` `[tests]` · find Groups by label; cover `&` escaping.
- `src/main/domain/pin-file.test.ts` `[tests]` · `QA` vs `qa` stay distinct.
- `src/main/controller/tray-menu.ts` `[docs]` · docs on `TrayActions.startGroup` / `stopGroup`.

## ⚪ Disagree / Intentional
- New method in ~6 places (shared/ipc, preload, ipc, tray-menu, index, controller) `[design]` · the established per-command IPC pattern across the Electron boundary (ADR-0001); a generic registry would be over-engineering.
- `asId` reused for group names `[design]` · same check (non-empty string < 4096); an unknown name runs nothing.
- Tray hides Groups while Docker is down, dashboard disables them `[design]` · matches how each surface already treats service rows.

## Per-dimension summary
- Design: proportionate, no layering breach; groups derived from pins, fan-out reuses `run` · Docs: three stale diagram/spec points fixed · Tests: trustworthy, edge cases added · Security: IPC trusted-sender + validation, menu labels escaped, React text only — no finding · Correctness: one stale-snapshot race fixed.
