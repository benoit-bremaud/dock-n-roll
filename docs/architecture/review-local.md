# Local review — dock-n-roll (branch feat/visual-polish)

- Date: 2026-10-15
- Commit: 665851f (reviewed), fixes in the following commit
- Scope: branch diff `main...feat/visual-polish` — dashboard visual polish (plan step 8)
- Checks run: design · docs · accessibility · tests (the tests agent did not finish; its checks were done by hand — see below)
- Verdict: Must 0 · Should 2 · Nice 4 — Should resolved, 2 Nice applied (owner policy: Nice deferred unless trivial)

## 🔴 Must Have

_None._

## 🟡 Should Have — all done

- `src/renderer/src/styles/global.css` `[a11y]` · Enabled and disabled secondary buttons differed only by text colour plus a ~1.5:1 hairline (WCAG 1.4.11 asks 3:1 for control edges) · enabled buttons now use the muted border (~6:1); disabled ones borderless with `cursor: not-allowed`.
- `docs/architecture/diagrams/launcher/07-class-controller.md` `[docs]` · `ControllerDeps` lacked `homeDir` · added.

## 🔵 Nice to Have

- `src/renderer/src/format.ts:1` `[design]` · Status type taken from `shared/ipc` instead of `main/domain` · done.
- `src/renderer/src/App.tsx` `[design]` · Empty summary paragraph with no service · rendered only when non-null · done.
- `global.css` · Primary hover subtle; badge `margin-top: 5px` magic number · deferred.

## ⚪ Disagree / Intentional

- `homeDir` in `ControllerState` / `ControllerDeps` `[design]` · Constant pushed with each state; the simplest path, as the sandboxed renderer cannot read it (diagram 09).
- `format.ts` as a separate pure module `[design]` · Two callers, unit-tested.

## Per-dimension summary

- Design: no over-engineering; dependency rule held.
- Docs: diagrams 07 / 09 and ADR-0004 match the code.
- Accessibility: contrast checked in both themes (muted ~6.2:1 / 6.7:1, primary ~15:1); focus visible; colour never alone; native `disabled` kept.
- Tests (by hand): `format.test.ts` is the only renderer `.ts` test, so the widened Vitest include runs nothing twice nor in the wrong environment; 342 tests green.
