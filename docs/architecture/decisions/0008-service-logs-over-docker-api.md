# 0008 — Service logs over the Docker Engine API, shown in a dashboard panel

- **Status**: accepted
- **Date**: 2026-10-16
- **Extends**: ADR-0005 (a fourth Docker Engine call)

## Context and problem statement

UC7 (v1.1) shows the live logs of a service in the dashboard. Logs can come from the Docker
Engine API or from the `docker compose logs` CLI, and be shown in the existing dashboard
window or in a window of their own. A log is text written by any container, so it is
untrusted input for the renderer and a possible flood for IPC.

## Considered options

Source:
1. **`GET /containers/{id}/logs?follow=1&stdout=1&stderr=1&tail=500`** on the socket the
   observer already uses; a frame parser for the multiplexed stream.
2. `docker compose logs -f --tail=500 --no-color`, one child process per open view.

Display:
1. **A collapsible panel under the service row**, one at a time.
2. A `BrowserWindow` per service.

## Decision outcome

Owner MCDA, 2026-10-16: **API (440/500)** over CLI (330); **dashboard panel (435/500)** over
a dedicated window (315).

- The API needs no child process: closing is one `request.destroy()`, with no zombie on the
  close, dispose and quit paths. The frame parser is a pure function. ADR-0002 keeps the CLI
  for the lifecycle, where compose resolves the files; reading logs needs no such resolution.
- The panel stays inside the hardened dashboard window (trusted sender, CSP): no new window
  to harden.

### Consequences

- Good: no new dependency or process; logs only of containers of a listed service (ids
  checked in the main process); text only, ANSI and control characters removed, 500 lines of
  at most 2000 characters, pushes throttled to 200 ms.
- Bad: ~40 lines of frame parsing; one container at a time (picker for multi-container
  services); no follow across restarts (Reopen); a small panel instead of a full window.

### Addendum 2026-10-22 — follow across restarts (#33)

The "no follow across restarts" limit is lifted: the session is refreshed after every controller
recomputation and follows a container that runs again, the same one with `since`, a recreated
one with `tail` (diagram 16). Reopen stays for a stream that failed while its container runs.
