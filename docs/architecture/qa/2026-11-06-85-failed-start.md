# QA — a failed Start is labelled and announced (#85)

Packaged-build check of issue #85 on branch `fix/85-announce-failed-start-stop`, 2026-11-06.

## Setup

- `electron-vite build` + `electron-builder --linux dir`, launched twice (single-instance lock)
  under Xvfb (`--ozone-platform=x11`, no `WAYLAND_DISPLAY`), temp `XDG_CONFIG_HOME`, CDP on a
  local port. `pnpm e2e:smoke` green on the same build.
- Test stack `qaf85-fail`: one alpine container that exits with code 3, pinned as "QA fail".

## Checked (Chrome DevTools Protocol)

| Check | Result |
|---|---|
| Failure announcer before the click | one `role="status"` node, `aria-live="polite"`, `aria-atomic="false"`, empty |
| Click "Start QA fail" | `docker compose up --wait` fails, container `Exited (3)` |
| Row text | `Start failed:` (bold) + the last 5 Compose lines, one per line (`white-space: pre-line`) |
| Row colour | `--color-error` (dark theme `#ff7b72`, 7.5:1 on the background) |
| Announcer after the click | one line, `QA fail: Start failed: container qaf85-fail-app-1 exited (3)` |
| Accessibility tree | the same `status` node (unchanged id) before and after: the region was not rebuilt |

Screenshot of the row: [2026-11-06-85-failed-start.png](2026-11-06-85-failed-start.png).

## Not checked

- No screen reader (Orca) on this machine: the announcement itself was not heard. The check is
  the accessibility tree, as the issue allows.
