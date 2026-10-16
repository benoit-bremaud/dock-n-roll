# 0010 — E2E smoke of the packaged app over CDP

- **Status**: accepted
- **Date**: 2026-10-16

## Context and problem statement

Every brick ended with the same manual check of the built app (ADR-0007, ADR-0009): launch
`dist/linux-unpacked/dock-n-roll` with `--remote-debugging-port`, open the dashboard, read its URL,
title, console and IPC state. The composition root `src/main/index.ts` is excluded from coverage
and relies on that check. It must run automatically in CI, on the binary as shipped (fuses set,
ADR-0006), with or without Docker on the runner.

## Considered options (MCDA, owner choice C)

Weights: tests the hardened binary 35, test simplicity 25, dependency / CI cost 20, robustness 20.

1. **`--remote-debugging-port` + Playwright `chromium.connectOverCDP`** (`playwright-core`, no
   browser download) — 430/500.
2. Raw CDP over a WebSocket, no dependency — 370/500: waits and events written by hand.
3. Playwright `_electron.launch` — 255/500: it drives the main process through `--inspect`, which
   the `enableNodeCliInspectArguments` fuse turns off; it would need a weaker binary.

## Decision outcome

- `e2e/smoke.mjs`, run by `pnpm e2e:smoke`, outside Vitest and coverage. It starts the binary with
  a scratch `XDG_CONFIG_HOME` and a debugging port, starts a second instance to open the dashboard
  (single-instance lock), connects over CDP and asserts: page URL `app://dashboard/index.html`,
  title `dock-n-roll`, React root rendered, `window.dockNRoll.getState()` answers, no console or
  CSP error, `app://dashboard/..%2f..%2fetc%2fpasswd` answers 404, and the binary's fuse wire has
  `GrantFileProtocolExtraPrivileges` off (`@electron/fuses`).
- CI `package` job: `xvfb-run -a pnpm e2e:smoke` after `pnpm dist`, before the upload.
- Docker is not required: "Docker unavailable" is a valid state for the smoke.

### Consequences

- The debugging port is only passed by the smoke; the shipped binary and its fuses are unchanged.
- The smoke checks the wiring, not behaviour: service actions stay covered by unit tests.
