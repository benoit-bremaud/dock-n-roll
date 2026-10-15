# Local review — dock-n-roll (branch fix/startup-robustness)

- Date: 2026-10-15
- Commit: b09b861 + staged changes (reviewed), fixes in the same commit
- Scope: branch diff `main...fix/startup-robustness` — Brick A, startup robustness + issue #8
- Checks run: design · docs · tests · security · correctness
- Verdict: Must 0 · Should 5 · Nice 4 — Should resolved before push (owner policy: Must + Should applied, Nice filed)

## 🔴 Must Have

_None._

## 🟡 Should Have

- `src/main/index.ts:59-63` `[design|correctness]` · The `did-finish-load` push only fires once the controller exists, which is exactly when `getState` already works. A dashboard opened during startup (second-instance) still gets no state if the first recomputation equals the initial state (`publish()` dedup). · Push `created.state()` once to the dashboard right after wiring `onChange`. Drop the hook and the module-level `controller`.
- `src/main/index.ts:155,160,177` `[correctness]` · Quitting from the "Starting…" tray while the controller or autostart is pending causes two problems. `renderTray` runs on a destroyed Tray, which throws and triggers the "could not start" box. The dispose listener is also registered after `before-quit` has fired, so the controller is never disposed. · After each await, check `isQuitting`: dispose and return.
- `src/main/controller/service-controller.ts:243` `[tests|correctness]` · Nothing tests `dispose()` during the first recomputation, which this change has made reachable. `disposed` is only checked at the start of a step, so `rebuild()` can still publish afterwards. · Add a test, and guard `publish` on `disposed`.
- `src/main/adapters/docker-observer.test.ts:63-80` `[tests]` · No test for stop during a hung event request. Assertions are weak: a single outage is not checked, an early publish is not checked, and the held files are not counted. · Add the test and the assertions.
- `src/main/controller/service-controller.ts:103` `[docs]` · The docstring does not say what `state()` returns before the first recomputation. The `openEvents` docstring omits the timeout rejection. Diagram 07 says nothing about the new creation contract. · Add one line to each.

## 🔵 Nice to Have

- `src/main/adapters/fake-docker-daemon.ts:91-94` `[tests]` · Hung responses are not tracked, so `daemon.stop()` relies on the client destroying the socket. · Track them and end them in `stop()`.
- `src/main/adapters/docker-observer.test.ts:73-80` `[tests]` · The 150 ms sleep starts after the first snapshot rather than at `start()`. · Anchor it to the start time.
- `src/main/adapters/docker-observer.ts:133` `[design]` · The headers timeout reuses `REQUEST_TIMEOUT_MS`. · Use a named `EVENTS_HEADERS_TIMEOUT_MS`.
- `docs/architecture/diagrams/launcher/11-sequence-startup.md` `[docs]` · The packaged-only `await isAutostartEnabled` step is not shown. · Add an `opt packaged` block.

## ⚪ Disagree / Intentional

- `src/main/controller/service-controller.ts:332` `[design]` · Not awaiting the first recomputation is the owner's decision (MCDA option B, 435/500), recorded in PROJECT_LOG and diagram 11.
- `src/main/index.ts` `[tests]` · No unit test for the Electron wiring. It is covered by the manual check of #8 (cold and warm GNOME-menu launches).
- `src/main/adapters/docker-observer.ts:73,95` `[correctness]` · A timeout calls `lost()` twice, through reject and `onClose`. This is harmless: the generation guard makes the second call a no-op. A test now locks this to exactly one outage.

## Per-dimension summary

- Design: proportionate, no over-engineering; one redundant hook.
- Docs: complete, nothing stale; one partial contract.
- Tests: right levels, no over-mocking; two missing cases and weak assertions.
- Security: no issue. The push goes only to our own bundled window, and no new channel is added.
- Correctness: two startup and quit edge cases.
