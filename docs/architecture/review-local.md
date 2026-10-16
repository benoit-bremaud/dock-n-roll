# Local review — dock-n-roll (features brick, PR 2 crash notifications)

- Date: 2026-10-16
- Commit: base cfb7e0a..HEAD (branch feat/crash-notifications)
- Scope: branch diff main...HEAD (domain crash.ts, controller notifyCrashes, notifier.ts, oomKilled mapping, diagrams 01/03/05/07/13, spec UC3 3b, CHANGELOG)
- Checks run: design · docs · tests · security · correctness
- Verdict: ship after Should applied · Must 0 · Should 7 (applied) · Nice 6 (4 applied, 2 dropped)

## 🔴 Must Have
_None._

## 🟡 Should Have
- `src/main/controller/service-controller.ts` notifyCrashes `[correctness]` · `services` can lag behind `containers` (rebuilt in the chain): a container that dies before its row exists is missed · rows built synchronously from the previous snapshot with `buildServices`; test with held file checks. Applied.
- `src/main/controller/service-controller.ts` run `[correctness]` · The late `die` snapshot of a finished Stop, for apps exiting 1 on SIGTERM, is reported as a crash · 10 s quiet window per service after a Stop (`stoppedAt`, pruned); test. Applied.
- `src/main/domain/crash.ts` `[docs|correctness]` · `dead` counted always, but spec and diagram said dead needs OOM / exit code; `dead` with a code read "exited with code N" · docs say `dead` always counts; own message "died". Applied.
- `src/main/notifier.ts` `[design]` · Escaping would show `&amp;` literally off Linux · Linux-only app: comment states it (no platform branch, YAGNI). Applied.
- `service-controller.test.ts` `[tests]` · No test of a crash between the two restart steps · added. Applied.
- `service-controller.test.ts` `[tests]` · `deps.notify` throwing not covered · added (snapshot still applied). Applied.
- `service-controller.test.ts` `[tests]` · rate-limit test only counted calls · asserts exact title/body. Applied.

## 🔵 Nice to Have
- `service-controller.ts` notifyCrashes `[correctness]` · no `disposed` guard · added. Applied.
- `src/main/index.ts` `[conventions]` · import order · moved. Applied.
- `crash.test.ts` `[tests]` · split combined cases into `it.each`, add was-restarting and exited-without-code cases · applied.
- `crash.ts` crashMessage `[docs]` · `dead` with code wording · "died". Applied.
- `service-controller.test.ts` `[tests]` · prune of `notifiedAt` untested · dropped: same `prune` loop as the other per-service maps, already covered.
- `notifier.ts` `[security]` · cap the body length · dropped: container names are Docker-bounded, messages short.

## ⚪ Disagree / Intentional
- `crash.ts` SIGNAL_EXITS `[correctness]` · 130/137/143 ignored · owner MCDA A (450/500), OOM still reported.
- `notifier.ts` outside `adapters/` `[design]` · adapters may not import Electron (lint rule); Electron glue lives next to `ipc.ts`.

## Per-dimension summary
- Design: pure domain diff + injected notifier, no over-engineering. · Docs: dead rule aligned. · Tests: restart, failure and lag cases added. · Security: body escaped for libnotify markup; title is plain text. · Correctness: lagging rows and post-Stop false alarm fixed.
