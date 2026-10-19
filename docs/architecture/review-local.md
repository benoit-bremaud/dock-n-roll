# Local review — dock-n-roll (feat/app-icon, brick E PR 2: #47)

- Date: 2026-10-19
- Scope: branch diff main...feat/app-icon
- Checks run: design · docs · tests · security · correctness
- Verdict: ship · Must 0 · Should 2 (fixed) · Nice 4 (2 applied, 2 declined)

## Pre-merge gate
| Step | Result |
|---|---|
| 1 Tests | ✅ 565 unit/integration · ✅ E2E smoke 8/8 on the `--linux dir` build |
| 2 Coverage | 97.17 % stmts / 92.14 % branches / 97.64 % funcs / 98.47 % lines (gate 90/85/90/90) |
| 3 SonarQube | ✅ PASSED (0 new issues) |
| 4 Secrets | ✅ gitleaks clean · no tracked .env · SVG has no script or external reference |
| 5 QA pass | ✅ smoke 8/8 · `.deb` installs hicolor 32–512 px icons, `.desktop` has `Icon=dock-n-roll`, the "default Electron icon" warning is gone |

## 🔴 Must Have
_None._

## 🟡 Should Have (fixed)
- `electron-builder.yml` · only 256/512 px shipped, blurry at 48 px in the dock · 32, 48, 64 and 128 px added.
- `src/main/index.ts` · dashboard window had no icon (X11, `pnpm dev`) · `appIconPath` (tested) + `app-icon.png` extra resource.

## 🔵 Nice to Have
- `resources/icon.svg` · export command documented in the SVG comment (applied).
- `resources/icon.svg` · green dot vs monochrome tray: intentional, noted in the comment (applied).
- `resources/icon.svg` · tile at 87.5 % of the canvas vs GNOME's ~78 %: declined, it reads well at small sizes.
- `CHANGELOG.md` · sizes reworded (applied with the Should).

## ⚪ Disagree / Intentional
_None._

## Per-dimension summary
- Design: one resolver beside `trayIconPath` · Docs: CHANGELOG and SVG comment · Tests: `appIconPath` both branches · Security: static SVG · Correctness: icons verified in the `.deb`.
