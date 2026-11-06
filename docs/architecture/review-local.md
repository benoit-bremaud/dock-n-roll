# Local review — dock-n-roll (#85)

- Date: 2026-11-06
- Commit: b02ac4b
- Scope: branch diff main...fix/85-announce-failed-start-stop (`--push`)
- Checks run: adversarial (Opus, 3 rounds) · design · docs · tests · security · correctness
- Verdict: ship as-is · Must 0 · Should 0 · Nice 3 (2 filed as a follow-up issue, 1 intentional)

## Adversarial review (#236)

- Round 1 on `052c75d`: Must 2 (runner cause dropped by the last-lines excerpt; a service of two
  groups announced twice) · Should 3 · Nice 4 · Push gate: closed
- Round 2 on `321b073` (history rewritten before any push): all round-1 Must and Should fixed ·
  new Must 1 (diagram 09 wireframe still said `role=status` on the row) · Push gate: closed
- Round 3 on `b02ac4b`: fixed · new Must 0 · **Push gate: open**
- Hosted reviewers (filled at the pre-merge run): Copilot 422 (not a collaborator) · Codex pending

## Pre-merge gate (head SHA b02ac4b)

| Step | Result |
|---|---|
| 0 CI mirror | ci.yml quality (lint, typecheck, test:coverage) ✅ · package + `pnpm e2e:smoke` ✅ · dependency-audit (`pnpm audit --audit-level=high`) ✅ (2 moderate, known) · gitleaks ✅ |
| 1 Tests | ✅ 658 unit/integration · ✅ e2e smoke on the packaged build |
| 2 Coverage | tests 97.32 % stmts / 92.81 % branches / 97.95 % funcs / 98.6 % lines (floor 80) |
| 3 SonarQube | ✅ OK (new coverage 97.5 %, duplication 0.0 %, new violations 0) |
| 4 Secrets | ✅ gitleaks clean (main..HEAD) · no tracked .env · diff read: nothing sensitive (QA screenshot cropped to the test row) |
| 5 E2E/smoke | ✅ smoke on the local prod build · packaged QA: [qa/2026-11-06-85-failed-start.md](qa/2026-11-06-85-failed-start.md) |

- Gate: `--push`: **pre-push green**

## 🔴 Must Have

_None._

## 🟡 Should Have

_None._

## 🔵 Nice to Have

- `src/renderer/src/components/FailureAnnouncer.tsx:9` `[adversarial]` · failures already present
  are read out when the dashboard is first created or reloaded · follow-up issue.
- `src/renderer/src/components/FailureAnnouncer.tsx:16` `[adversarial]` · a rename while a
  failure stands re-announces it (text changes in the live region) · follow-up issue.

## ⚪ Disagree / Intentional

- `src/renderer/src/components/ServiceRow.tsx:44` `[adversarial]` · the failure text is not
  path-shortened like `Reason` (#44): Compose output is shown as written; it wraps.
- `src/renderer/src/components/FailureAnnouncer.tsx:13` `[adversarial]` · `role="status"` with
  `aria-live="polite"` is redundant by the spec, kept for older screen readers.

## Per-dimension summary

- Adversarial: 3 Must over 3 rounds, all fixed · Design: one shared `failure.ts`, no duplicate
  label map · Docs: diagrams 07 and 09, CHANGELOG, QA report · Tests: cause last, blank stderr,
  cleared after success, tray menu safety, two-group single announcement · Security: text-only
  rendering, tray label sanitised · Correctness: failure kept apart from `reason`, runner cause
  written last.
