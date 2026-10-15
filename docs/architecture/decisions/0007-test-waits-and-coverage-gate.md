# 0007 — Test waits on outcomes, coverage gated by fixed thresholds

- **Status**: accepted
- **Date**: 2026-10-15

## Context and problem statement

Several adapter tests (pin file watcher, Docker observer) waited fixed real-time delays
(20–400 ms) before asserting, which can flake on a loaded CI runner (issue #18). The suite had
no coverage measurement, so an untested module (IPC handlers, preload) could go unnoticed.

## Considered options (coverage thresholds — MCDA, owner choice A)

Weights: regression protection 35, CI stability 25, simplicity 20, maintenance 20.

1. **Global thresholds = measured coverage rounded down to a multiple of 5 (5–8 points
   under), raised by hand** — 420/500.
2. `thresholds.autoUpdate` (Vitest ratchets the numbers itself) — 365/500: a refactor that
   deletes tested code turns CI red.
3. Report only, no threshold — 350/500: blocks nothing.

## Decision outcome

- **Waits**: a test waits on the observable outcome (`vi.waitFor`, or a signal such as the fake
  Docker daemon's `answered` list), never a fixed delay. Timing-only behaviour (debounce, close
  with a reload pending) is tested with fake timers against a mocked filesystem
  (`pin-file-store-fs.test.ts`). The remaining negative checks ("nothing happens") use a named
  `quietFor` window: a slow runner can only make them pass wrongly, never fail wrongly.
- **Coverage**: `@vitest/coverage-v8`, `pnpm test:coverage` in CI, global thresholds
  statements 90, branches 85, functions 90, lines 90 (measured 2026-10-15: 96.4 / 90.6 / 97.2 /
  98.2). Excluded: the Electron composition roots `src/main/index.ts` and
  `src/renderer/src/main.tsx` (covered by the manual test of the built app), test helpers and
  declaration files.
- The trust check of IPC callers is a pure function (`src/main/trusted-sender.ts`, diagram 07),
  so it is unit-tested without Electron. Its wiring in `index.ts` (live window, page origin) is
  not covered automatically: it stays in the composition root, checked by the manual test of
  the built app (the dashboard loads its state over IPC).

### Consequences

- Raise the thresholds by hand when coverage grows durably; never lower them to merge.
- A negative check can miss a regression on a very slow runner; it cannot turn CI red wrongly.
