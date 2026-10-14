# Local review — dock-n-roll (branch feat/dashboard)

- Date: 2026-10-14
- Commit: e0b4858 (reviewed), fixes in the following commit
- Scope: branch diff `main...feat/dashboard` — React dashboard window, renderer test stack
- Checks run: design · tests · security and accessibility · docs
- Verdict: Must 5 · Should 12 · Nice ~6 — Must and Should resolved (owner decision: Nice deferred); no security finding

## 🔴 Must Have — all done, test-first

- Renderer calls `[security|design|tests]` · Failed IPC calls were unhandled: a failed scan left the Running tab empty without a word · errors shown ("Could not scan: …", "Could not read the state: …").
- `useControllerState.ts` `[design|tests]` · A late initial read could overwrite a newer pushed state (StrictMode re-run, `api` change) · `active` flag; test with a late `getState`.
- `App.test.tsx` `[tests]` · Start enabled / its id never tested · mirror test added.
- `09-component-dashboard.md` `[docs]` · `ServiceList` did not exist · diagram aligned.
- Spec §4 vs code `[docs]` · Rows kept their badge while Docker was unavailable · greyed without badge or status, as the spec says.

## 🟡 Should Have — all done

- `null` answers typed in `DockNRollApi`; `Root` explains a missing preload API instead of a blank window (packaging risk).
- WAI-ARIA tabs pattern: tabpanel, one tab stop, arrow keys / Home / End.
- One stable alert region; unique banner keys.
- No `aria-label` on rows hiding their status and reason.
- Disabled buttons dashed at `--opacity-disabled`; visible focus.
- Running tab: stale answers ignored, empty states, unique port keys.
- README, spec UC4 columns, ADR-0004 amendment (renderer test stack), Vitest project split documented and enforced.
- Tests: multiple banners, owner kinds and fallbacks, refresh updates the view, scan failure, tab switch back, running health kept.

## 🔵 Nice to Have — deferred

Dedicated warning colour for banners; radius / border / divider tokens; long names and table layout; table captions; loading placeholder before the first state.

## Per-dimension summary

- Design: conformant to diagram 09 and ADR-0004; no component library, tokens only.
- Tests: 291 → 302; renderer behaviour tested through roles and accessible names.
- Security: all Docker and pin text rendered as React text; CSP-compatible.
- Accessibility: tabs pattern, stable alerts, status words, visible focus.
