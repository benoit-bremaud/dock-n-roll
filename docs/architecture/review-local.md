# Local review — dock-n-roll (#98)

- Date: 2026-11-06
- Commit: 8882e57
- Scope: branch diff origin/main...feat/98-group-members-in-tray (`--push`)
- Checks run: adversarial (Opus, 3 rounds) · design · docs · tests · accessibility · security · correctness
- Verdict: ship as-is · Must 0 · Should 0 · Nice 6 (deferred, follow-up issue)

## Adversarial review (#236)

- Round 1 on `2053495`: Must 0 · Should 4 · Nice 5 · unverified 0 · Push gate: open
- Round 2 on `89353fa`: 4 Should + 4 Nice fixed · 1 Nice deferred · new Must 1 (diagram 09 stale after `runningSummary` moved) · Push gate: closed
- Round 3 on `8882e57`: Must and Should fixed · new Nice 1 · **Push gate: open**
- Hosted reviewers (filled at the pre-merge run): Copilot pending (422, not a collaborator) · Codex pending

## Pre-merge gate (head SHA 8882e57)

| Step | Result |
|---|---|
| 0 CI mirror | ✅ lint · typecheck · test:coverage · build · dist (`electron-builder --linux dir`) + `e2e:smoke` on `89353fa` (later commit: diagrams and one comment) |
| 1 Tests | ✅ 642 unit/integration |
| 2 Coverage | ✅ 97.3 % stmts / 92.74 % branches / 98.59 % lines (thresholds 90/85/90/90) · docs ⏸ deferred to the pre-merge run (`--push`) |
| 3 SonarQube | ⏸ deferred to the pre-merge run (`--push`) |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · no tracked .env · diff read: nothing sensitive |
| 5 E2E/smoke | ✅ `e2e:smoke` (group section holds its member row) · packaged QA under Xvfb: sections "Demo 1 of 2 on" [QA API, QA Web], "QA 0 of 1 on" [QA Web], screenshot checked |

- Gate: `--push`: **pre-push green** — Sonar and doc coverage deferred (never GREEN)

## 🔴 Must Have

_None._ (Round 2: diagram 09 still placed `runningSummary` in `format.ts` → fixed in `8882e57`.)

## 🟡 Should Have

_None._ (Fixed: group count hidden while Docker is down; per-section button names; diagrams 09, 07, 03, use case 01; README tray line; CHANGELOG folded into the unreleased #77 entry; one summary rule in `src/shared/groups.ts`; smoke checks a member row; collapsed-section test.)

## 🔵 Nice to Have (deferred to one follow-up issue)

- `src/renderer/src/App.tsx:41,49` `[adversarial]` · a stale `logsFor` key can reopen a logs panel when a service comes back into a group · clear it when its key is no longer rendered.
- `src/renderer/src/components/GroupSection.tsx` `[design]` · Start all / Stop all hide with a collapsed section; collapsed state resets on a tab change.
- `src/main/controller/tray-menu.ts:79-80` `[adversarial]` · Start all / Stop all always enabled, even when no member can act (pre-existing).
- `docs/architecture/diagrams/launcher/09-component-dashboard.md:21` `[adversarial]` · `GroupsView` drawn inside the renderer subgraph; no `LogPanel --> Format` edge (pre-existing).
- `docs/architecture/diagrams/groups/02-sequence-start-group.md:20` `[adversarial]` · says "Start group QA", the button reads "Start all" (pre-existing).
- `README.md:34-35` `[adversarial]` · over-long lines, reflow.

## ⚪ Disagree / Intentional

- `src/renderer/src/components/GroupSection.tsx:19` `[adversarial]` · sections open by default with their controls visible · owner MCDA A 480 (#98); controls appear only once a group exists.

## Per-dimension summary

- Adversarial: 0 Must in round 1, 1 docs Must in round 2 fixed, gate open in round 3 · Design: small shared pure module, no new IPC channel · Docs: README, CHANGELOG, spec UC8, diagrams 01/03/07/09 · Tests: tray, shared helpers, dashboard sections, logs per section, collapse kept · Accessibility: native details/summary, per-section button names · Security: no new input path; labels go through `menuLabel` · Correctness: keys unique per list, logs keyed by section.
