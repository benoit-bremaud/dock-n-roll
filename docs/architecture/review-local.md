# Local review — dock-n-roll (brick C: supply chain & hardening)

- Date: 2026-10-15
- Commit: 9ef3a2d
- Scope: branch diff main...chore/supply-chain-hardening
- Checks run: design · docs · tests · security · correctness
- Verdict: ship after Should fixes  ·  Must 0 · Should 3 · Nice 4 (all Should applied)

## 🔴 Must Have

_None._

## 🟡 Should Have

- `src/main/adapters/pin-file-store.ts:52` `[design|correctness]` · stat-then-read race: the
  comment claimed a huge file "never reaches memory". · Applied: comment reworded as best effort
  (TOCTOU accepted in the owner's MCDA choice A; the file is the user's own config).
- `.github/dependabot.yml` `[security]` · no cooldown: a freshly published, possibly compromised
  release is proposed the same day. · Applied: `cooldown.default-days: 5` on npm.
- `src/main/adapters/pin-file-store.test.ts:166` `[tests]` · test name promised "without reading it"
  (unasserted) and the `>` boundary was untested. · Applied: renamed; exact-64 KiB acceptance test.

## 🔵 Nice to Have

- `pin-file-store.ts:54` `[correctness]` · a FIFO/device named `services.yaml` passes with size 0
  (bounded by the 5 s timeout) — an `isFile()` check would give a clearer error.
- `pin-file-store.ts:54` `[docs]` · error says "65536 bytes"; "64 KiB" would match ADR-0005.
- `electron-builder.yml:10` `[docs]` · fuse rationale duplicated with ADR-0006 — point to the ADR.
- `pin-file-store.test.ts` `[design|tests]` · the cap is hard-coded in tests; export the constant.

## ⚪ Disagree / Intentional

- `pin-file-store.ts:52` `[correctness]` · `stat` follows symlinks (target size checked) and ENOENT
  still means no pins through the existing catch.
- `electron-builder.yml` `[security]` · `grantFileProtocolExtraPrivileges` stays on: turning it off
  broke the dashboard on the built app (ADR-0006).

## Per-dimension summary

- Design: no over-engineering, dependency rule kept · Docs: ADR-0005/0006 and diagram 08 match
  the code · Tests: trustworthy, boundary added · Security: Dependabot valid, cooldown added, fuse
  reasoning sound · Correctness: no bug, race documented.
