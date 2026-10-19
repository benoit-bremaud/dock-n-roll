# Local review — dock-n-roll (feat/dashboard-polish, brick E PR 1: #14 #44)

- Date: 2026-10-19
- Scope: branch diff main...feat/dashboard-polish
- Checks run: design · docs · tests · security · correctness
- Verdict: ship after fixes · Must 2 (fixed) · Should 5 (fixed) · Nice 5 (filed)

## Pre-merge gate
| Step | Result |
|---|---|
| 1 Tests | ✅ 561 unit/integration · ✅ E2E smoke 8/8 on the `--linux dir` build |
| 2 Coverage | 97.16 % stmts / 92.11 % branches / 97.62 % funcs / 98.46 % lines (gate 90/85/90/90) |
| 3 SonarQube | ✅ PASSED (new coverage 97.7 %, 0 new issues, 0 % duplication) |
| 4 Secrets | ✅ gitleaks clean · no tracked .env · diff read: nothing sensitive |
| 5 QA pass | ✅ E2E smoke on the packaged app (ADR-0010): console and CSP clean |

## 🔴 Must Have (fixed)
- `src/renderer/src/format.ts` `[correctness|tests]` · the path regex matched "and/or", URLs and trailing quotes or punctuation · bounded regex `REASON_PATH`, tests per case.
- `src/renderer/src/format.ts` `[correctness]` · `middleEllipsis` returned more than `max` for `max ≤ 1` · guard, `it.each` over 0–11.

## 🟡 Should Have (fixed)
- `ServiceRow.tsx` `[a11y]` · full reason only in `title` · tooltip only when cut; full reason in a visually hidden span, the cut one `aria-hidden`.
- `format.test.ts` / `App.test.tsx` `[tests]` · edge cases: several paths, home alone, quotes, URL; loading notice dropped once the state arrives.
- `format.ts` `[docs]` · `shortenReason` docstring matched only "absolute paths"; `0.4` named `HEAD_SHARE`.
- `App.tsx` `[docs]` · `ServicesPanel` docstring covers the read-error case; explicit `null`.
- `tokens.css` `[design]` · `--radius-round: 50%` removed (nothing to theme).

## 🔵 Nice to Have (filed as an issue)
- `ServicesPanel` could move to `components/`.
- `.app__empty` now also styles the loading notice (rename to `app__notice`).
- A distinct error colour for `role=alert` read errors vs warning banners.
- `.running td { overflow-wrap: anywhere }` may break mid-word on a narrow window; limit to Name/Image.
- Loading `<output>` mounted already filled may not be announced (initial render: read in normal flow).

## ⚪ Disagree / Intentional
- `<caption>` + `aria-labelledby`: the heading names the table, the caption describes it.
- Badge `1lh`: the badge inherits the row's body font and line-height, the same as the name's line.
- Forced colours: the hover ring now falls back to an outline (fixed alongside).

## Per-dimension summary
- Design: proportionate; one superfluous token removed · Docs: two docstrings corrected · Tests: edge cases added · Security: text only, no HTML injection · Correctness: two edge bugs fixed.
