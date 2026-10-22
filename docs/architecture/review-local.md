# Local review — dock-n-roll (feat/logs-across-restarts, brick E PR 4: #33 part 2)

- Date: 2026-10-22
- Commit: see the commit that adds this report (head of PR #62)
- Scope: branch diff main...feat/logs-across-restarts
- Checks run: design · docs · tests · security · correctness · QA
- Verdict: ship after fixes · Must 1 (fixed) · Should 8 (fixed) · Nice 6 (2 applied, 4 filed/kept)

## Pre-merge gate

| Step | Result |
|---|---|
| 1 Tests | ✅ 589 unit/integration (vitest) · ✅ 8/8 E2E smoke on the packaged app |
| 2 Coverage | tests 97.2 % stmts / 92.5 % branches / 97.5 % funcs / 98.5 % lines (floors 90/85/90/90) · docs: every exported symbol of the changed files documented after the fixes |
| 3 SonarQube | ✅ PASSED (new coverage 98.1 %, duplication 0 %, new violations 0) |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · no tracked .env · diff read: nothing sensitive |
| 5 QA pass | ✅ full · packaged app against a real busybox ticker, `docker restart` → panel resumes with the marker · console clean · screenshots: `qa/2026-10-22-logs-before-restart.png`, `qa/2026-10-22-logs-after-restart.png` |

- Gate: **GREEN**

## 🔴 Must Have
- `src/main/index.ts:195` + `src/main/controller/log-session.ts` `[design|correctness|QA]` · A `docker restart` was never followed: `refresh()` ran only on published (deduplicated) states, which hold no container ids, and resume waited for a snapshot showing the container stopped. QA reproduced it. · **Fixed**: `ServiceController.onRecompute` (every recomputation), and a clean stream end (`STREAM_ENDED`, the daemon closes a follow stream on stop) counts as "seen stopped". Tests added on both sides.

## 🟡 Should Have
- `src/main/adapters/docker-logs.ts:22` `[docs|design]` · `followLogs` docstring sat on `FollowOptions` · **Fixed** (moved, options documented).
- `src/main/controller/log-session.ts:15` `[design]` · Docker unit (seconds) leaked into the port · **Fixed**: `sinceMs`, converted in the adapter.
- `src/main/controller/log-session.ts:44` `[design]` · "Service no longer listed" drove control flow as a literal · **Fixed**: `UNLISTED`.
- `src/main/controller/log-session.ts:82` `[correctness|docs]` · `lastSeenAt` not reset when a stream starts · **Fixed** in `start()`.
- `docs/architecture/decisions/0008-service-logs-over-docker-api.md` `[design]` · ADR consequence reversed silently · **Fixed**: dated addendum.
- `docs/architecture/diagrams/launcher/16-state-log-session.md` `[docs|design]` · trigger, marker exception and "nothing lost" wording stronger than the mechanism · **Fixed**.
- `src/main/controller/log-session.test.ts` `[tests]` · failed-stream test did not assert the reason kept · **Fixed**; marker literal now imported (`RESTART_MARKER`).
- Codex P2 ×2 (stop recorded while streaming, boundary before the reconnect) · **Fixed** earlier on this PR.

## 🔵 Nice to Have
- Resume boundary from daemon timestamps (`timestamps=1`), clock skew, `tail` with `since`, last line repeated around the marker (QA) · filed **#63**.
- Logs panel opens mid-buffer instead of at the newest line (QA) · filed **#64**.
- `log-session.ts` `[design]` · extract a pure `resumeTarget()` · kept for a later refactor (7 `let`s, still readable).
- `log-session.test.ts` `[tests]` · hand-picked test could stop both containers; `byService` setup repeated · kept.

## ⚪ Disagree / Intentional
- `log-session.ts` · marker kept when the container was recreated (new id) · validated by the owner with diagram 16 (option A, 460/500).
- `docker-logs.ts` · `FollowOptions` object instead of a fifth positional parameter · parameter object, intended.

## Per-dimension summary
- Design: one hidden coupling to a lossy projection (fixed); no over-engineering · Docs: docstring misplaced and diagram drift (fixed) · Tests: healthy pyramid, boundary doubles only · Security: no findings (`since` numeric, no new IPC) · Correctness: restart missed between snapshots (fixed, verified in QA).
