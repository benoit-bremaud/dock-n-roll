# Local review — dock-n-roll (features brick, PR 1 Restart)

- Date: 2026-10-16
- Commit: base e92370f..HEAD (branch feat/features-brick)
- Scope: branch diff main...HEAD (Restart action UC6: controller, domain controls, tray, IPC, preload, renderer, diagrams 01/04/12, CHANGELOG, README)
- Checks run: design · docs · tests · security · correctness
- Verdict: fix Must Have first · Must 2 · Should 6 · Nice 4

## 🔴 Must Have
- `src/main/controller/service-controller.test.ts` (restart describe) `[tests|correctness]` · No test that a Start/Stop clicked between the two steps is refused — the main promise of the in-place pending swap · finish the stop, click start and stop, assert only the `up` follows.
- `src/main/controller/service-controller.test.ts` (restart describe) `[tests]` · No test of the runner throwing during a restart (new `runOne` catch) · reject the stop, assert the reason, no `up`, and a later control allowed.

## 🟡 Should Have
- `src/main/controller/service-controller.ts` (`run` step loop) `[correctness]` · The healthUrl gate stays `passed` if Docker never shows the containers down between stop and up: the row turns `on` without a new probe · reset the gate and cancel the probe before the `up` step; test it.
- `src/main/controller/service-controller.ts` (`run` step loop) `[design|correctness]` · The `up` still runs after `dispose()` once the stop ends · break the loop when disposed.
- `src/main/ipc.ts:32` `[design]` · Third copy of the id-command handler (Rule of Three) · local `command(channel, act)` helper.
- `docs/architecture/specs/v1-spec.md` §4, §5 `[docs]` · Diagrams cite UC6 but the spec has no UC6 nor a Restart column · add both.
- `src/main/controller/service-controller.test.ts` (double click) `[tests]` · Double-click check only counts runs before anything ends · finish both steps, assert exactly stop + up.
- `src/main/controller/service-controller.test.ts` `[tests]` · Restart failing after an id change between steps not covered · covered by the existing id-change keying; add the failed-stop "controls.restart back" check instead (cheaper, same row path).

## 🔵 Nice to Have
- `src/main/controller/service-controller.ts` (`run`) `[design]` · `request: keyof Controls` instead of `PendingOperation | 'restart'`.
- `src/main/domain/derive-status.ts` docstring, `derive-status.test.ts` describe `[docs]` · still "Start / Stop columns".
- `src/main/controller/service-controller.ts` `Pending` docstring `[docs]` · mention restart.
- `src/main/domain/derive-status.test.ts` `[tests]` · `starting` (container-driven) allows restart case.

## ⚪ Disagree / Intentional
- `src/main/controller/service-controller.ts` `unresolved` branch `[tests]` · `{ ...derived, start: false }` passes `restart` through, but an unresolved service has no container, so its status is `off` and `restart` is already false — no silent drop.
- `src/main/domain/derive-status.ts` `startStop` + `Omit` `[design]` · one source of truth: restart = stop except on `missing`.

## Per-dimension summary
- Design: no over-engineering; IPC duplication and dispose check. · Docs: spec lacks UC6; two stale docstrings. · Tests: healthy pyramid; two missing restart behaviours. · Security: new IPC channel validated like start/stop; no injection path. · Correctness: health gate not reset on restart.
