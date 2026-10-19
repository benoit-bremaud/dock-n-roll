# Local review — dock-n-roll (chore/packaging-polish)

- Date: 2026-10-19
- Commit: review run on 0cbddb2; findings applied in the next commit
- Scope: branch diff origin/main...HEAD (autostart adapter, index.ts, electron-builder.yml, package.json, README, CHANGELOG, ADR-0006, diagram 11)
- Checks run: design · docs · tests · security · correctness
- Verdict: ship. Must 0 · Should 4 (3 applied, 1 accepted) · Nice 5 (3 applied, 2 Disagree)

## Pre-merge gate
| Step | Result |
|---|---|
| 1 Tests | ✅ 545 unit/integration · ✅ 8/8 E2E smoke on the packaged app |
| 2 Coverage | tests 97.1 % stmts / 92.0 % branches / 97.6 % funcs / 98.4 % lines (floor 80; runner gate 90/85/90/90) · docs: ADR-0006 and diagram 11 updated |
| 3 SonarQube | ✅ PASSED (new coverage 97.5 %, 0 new violations, 0 % duplication) |
| 4 Secrets | ✅ gitleaks clean · no tracked .env · diff read: only the public GitHub noreply address, by owner choice (MCDA 420) |
| 5 QA pass | ✅ E2E smoke; `.deb` built: `Maintainer: Benoît Bremaud <130740257+benoit-bremaud@users.noreply.github.com>`, the `desktopName` warning is gone, and only the icon warning remains (#47) |
- Gate: **GREEN — merge authorised** once CI is green

## 🔴 Must Have
_None._

## 🟡 Should Have
- `docs/architecture/decisions/0006-*.md`, `diagrams/launcher/11-sequence-startup.md` `[docs]` · They did not describe the unreadable entry · **Applied**: an ADR line and an `alt` branch in the diagram.
- `src/main/adapters/autostart.ts` `[docs]` · Why GNOME ignores the `.tmp` file was not explained · **Applied**: comment.
- `autostart.test.ts` `[tests]` · The failure test did not name the step that fails · **Applied**: "when the rename over the entry fails".
- `src/main/index.ts` `readAutostart` `[tests]` · The catch branch is untested · **Accepted**: `index.ts` is excluded from coverage by design (Electron glue). The adapter it relies on is tested.

## 🔵 Nice to Have
- `autostart.ts` `[security]` · A planted `.tmp` symlink was followed by `writeFile` and `chmod` (same user only) · **Applied**: `rm` the temporary file, then write with `flag: 'wx'`, plus a symlink test.
- `autostart.ts` `[correctness]` · A `.tmp` directory made the cleanup hide the first error · **Applied**: `recursive: true` on both `rm` calls.
- `README.md` `[docs]` · "starts at every login" is only true once the user ticks the box · **Applied**.

## ⚪ Disagree / Intentional
- Test the mode under a 077 umask · Vitest cannot change the umask of its worker. The 0o600 → 0o644 replacement test already proves that `chmod` enforces the mode.
- #13 `index.ts` `autostart === undefined ? {} : { autostart }` · It cannot be simplified: `exactOptionalPropertyTypes` forbids passing `undefined`.
- #13 whole-file equality in `autostart.test.ts` · The test compares against `autostartEntry(...)`, not a copied literal, so wording changes do not break it.
- #27 CI `pnpm install` duplicated · Kept, as decided in #27: it gives a clearer failure signal.

## Per-dimension summary
- Design: atomic write is simple and safe · Docs: ADR-0006, diagram 11, README, CHANGELOG current · Tests: write, mode, cleanup, EACCES, ENOTDIR and symlink covered · Security: no privilege boundary crossed; planted temporary file no longer followed · Correctness: unreadable setting never shown as off
