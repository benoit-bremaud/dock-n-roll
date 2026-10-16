# Local review — dock-n-roll (PR 3, service logs view, UC7)

- Date: 2026-10-16
- Commit: 1f50644 + review fixes
- Scope: branch diff origin/main...feat/logs-view
- Checks run: design · docs · tests · security · correctness
- Verdict: ship (all Must and Should applied) · Must 5 · Should 9 · Nice 8

## Pre-merge gate
| Step | Result |
|---|---|
| 1 Tests | ✅ 503 unit/integration (vitest), lint and `tsc --build` clean |
| 2 Coverage | lines 98.3 % / branches 91.5 % / funcs 97.3 % (floors 90/85/90) |
| 3 SonarQube | ✅ PASSED (new_coverage 96.8, duplication 0.0, new_violations 0). The S5852 hotspots on the linear regexes in `log-lines.ts` still need a review in the UI |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD), no tracked .env, diff read: nothing sensitive |
| 5 QA pass | ✅ manual E2E on the built app: multiplexed and TTY logs, ANSI stripped, HTML kept as text, picker, autoscroll, stop leads to ended then Reopen, close and hide free the socket |
- Gate: **GREEN** (once the Sonar hotspots are reviewed)

## 🔴 Must Have (all applied)
- `src/main/index.ts` `[design|correctness]`: the panel froze after the dashboard hid. A null push now ends the panel with "Logs closed" and offers Reopen.
- `src/main/adapters/docker-logs.test.ts` `[tests]`: the headers timeout had no test. Added.
- `src/renderer/src/components/LogPanel.test.tsx` `[tests]`: autoscroll had no test. Added; `isFollowing` was extracted and tested.
- `src/main/adapters/docker-logs.ts` `[docs]`: `followLogs` had no docstring. Added.
- `docs/.../14-sequence-service-logs.md` `[docs]`: the call shapes were wrong and the hide/reload close was missing. Fixed.

## 🟡 Should Have (all applied)
- `log-lines.ts`: frame size is bounded (1 MiB) and headers are validated; `cleanLogLine` cuts the line before running the regexes.
- `LogPanel.tsx`: Reopen is also offered after "No container yet".
- Tests strengthened: stop, split offset, the 500-line cap, and the partial line reset in `LogSession`.
- `docker-logs.ts`: added a response error listener.
- Docs: diagram 07 now uses LogStream and has the LogSessionDeps block; the "else first" docstrings and the lifecycle wording are aligned (14, 07, spec UC7); 500 lives in one constant.

## 🔵 Nice to Have (to file as one backlog issue)
- One decoder per stream.
- `open()` on an unknown service publishes nothing.
- Follow the logs across restarts, and refresh the stale containers list.
- Handle `\r` progress bars.
- Move the frame parser to adapters (owner's call).
- Give `registerIpc` a params object.
- Spec UC order.
- Mention the tray in the CHANGELOG entry for Restart.

## ⚪ Disagree / Intentional
- `docker-logs.ts` `[correctness]`: TTY detection by Content-Type is safe, because the API is pinned at /v1.47 (≥ 1.42) by ADR-0005.

## Per-dimension summary
- Design: flat, with injected deps, proportional.
- Docs: the diagrams are aligned with the code.
- Tests: the boundary is the fake daemon, no domain mocks.
- Security: only ids cross IPC, text-only rendering, bounded parsing.
- Correctness: stale streams are ignored, and every path closes its stream.
