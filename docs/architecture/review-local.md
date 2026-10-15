# Local review — dock-n-roll (brick E)

- Date: 2026-10-15
- Commit: base 6c49829.. (branch docs/brick-e-docs-release)
- Scope: branch diff origin/main...HEAD (README, CHANGELOG, PROJECT_LOG, diagrams 07/09, package.json, CI)
- Checks run: docs · security · correctness (design and tests: no source or test code changed)
- Verdict: ship after Should applied · Must 0 · Should 7 (applied) · Nice 4

## 🔴 Must Have
_None._ (doc-auditor's "#16 is an issue, not a PR" reclassified Should: wording only.)

## 🟡 Should Have (all applied)
- `CHANGELOG.md:40` `[docs]` · #16 is an issue · "closes #16".
- `CHANGELOG.md:23-24` `[docs]` · untraced entries · rootless → #5, CI job → brick E.
- `package.json:26` `[correctness]` · `repository` lets electron-builder infer a publish target · `--publish never`.
- `README.md` `[security]` · `docker` group is root-equivalent · warning added.
- `README.md` `[docs]` · AppArmor reload without check · `aa-status` check first (path verified in the built deb's postrm).
- `README.md` `[docs]` · 🟠 wording · "starting, stopping or partial".
- `README.md` `[docs]` · hard-coded 1.0.0 in install command · glob.

## 🔵 Nice to Have (filed as an issue)
- `electron-builder.yml:29` · maintainer without email (lintian).
- `README.md` · warn to install only own/CI-built .deb.
- electron-builder warnings: no app icon, no `desktopName` (WM_CLASS association).
- `.github/workflows/ci.yml` · duplicate `pnpm install` across jobs — kept for clearer failure signal.

## ⚪ Disagree / Intentional
_None._

## Per-dimension summary
- Design: n/a (no code) · Docs: claims verified against code, 5 fixes · Tests: n/a · Security: 1 warning added, CI job least-privilege & SHA-pinned · Correctness: publish disabled explicitly.
