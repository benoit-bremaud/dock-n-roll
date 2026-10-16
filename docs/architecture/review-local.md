# Local review — dock-n-roll (fix/pin-file-checks)

- Date: 2026-10-16
- Commit: 066509e (review run on 8b9ba04; findings applied in 73ff290 and 066509e)
- Scope: branch diff origin/main...HEAD (pin-file-store.ts, its two test files, CHANGELOG.md)
- Checks run: design · docs · tests · security · correctness
- Verdict: ship. Must 0 · Should 4 (applied) · Nice 4 (3 applied, 1 Disagree)

## Pre-merge gate (head SHA 066509e)
| Step | Result |
|---|---|
| 1 Tests | ✅ 537 unit/integration · ✅ 8/8 E2E smoke (`pnpm e2e:smoke` on the packaged app) |
| 2 Coverage | tests 96.9 % stmts / 91.4 % branches / 97.6 % funcs / 98.3 % lines (floor 80; runner gate 90/85/90/90) · docs: new export documented |
| 3 SonarQube | ✅ PASSED (new coverage 97.2 %, 0 new violations, 0 % duplication) |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · no tracked .env · diff read: nothing sensitive |
| 5 QA pass | ✅ E2E smoke on the packaged binary (ADR-0010): dashboard loads, console and CSP clean, app:// containment holds |
- Gate: **GREEN — merge authorised** once CI is green

## 🔴 Must Have
_None._

## 🟡 Should Have
- `src/main/adapters/pin-file-store.ts:60` `[security|correctness]` · A stat/read race let a file swapped for a FIFO or grown past the cap through, and a hung FIFO read pinned a libuv thread · **Applied**: open with `O_NONBLOCK`, then stat and read at most cap + 1 bytes from the same handle.
- `src/main/adapters/pin-file-store.test.ts` `[tests]` · No test showed that a FIFO replacing a valid file keeps the last pins · **Applied**.
- `src/main/adapters/pin-file-store.test.ts` `[tests|security|design]` · `mkfifo` is POSIX only · **Applied**: `it.skipIf(process.platform === 'win32')`.
- `CHANGELOG.md:9` `[docs]` · The error text a user can see changed · **Applied**: a Fixed entry under Unreleased.

## 🔵 Nice to Have
- `pin-file-store.ts:16` `[design]` · The cap repeated `1024` · **Applied**: `64 * KIB`.
- `pin-file-store.test.ts` `[tests]` · The oversize test did not pin the rounding · **Applied**: exactly one byte over the cap.
- `pin-file-store.test.ts` `[tests]` · Directory case · **Applied**.

## ⚪ Disagree / Intentional
- `docs/architecture/diagrams/launcher/08-sequence-pin-file-change.md:26` `[docs]` · Suggestion to add "regular files only". The diagram shows the flow, not each validation; the docstring and the CHANGELOG carry the rule.

## Per-dimension summary
- Design: clean, no over-engineering · Docs: accurate; CHANGELOG added · Tests: trustworthy; FIFO swap, directory, grown file and open error covered · Security: race closed; symlinks still refused when they point at a non-regular file · Correctness: KiB rounding is right (ceil)
