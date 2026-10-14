# 0001 — Electron + TypeScript as the desktop stack

- **Status**: accepted
- **Date**: 2026-10-09

## Context and problem statement

dock-n-roll needs a GNOME top-bar icon (Ubuntu 24.04, GNOME 46, Wayland, extension
`ubuntu-appindicators` enabled) plus a small dashboard window. Goal: a useful personal tool,
delivered fast. The owner's daily stack is TypeScript / React.

## Considered options

1. Electron + TypeScript
2. Tauri (Rust core + web UI)
3. Python + GTK
4. GNOME Shell extension (GJS)

## Decision outcome

**Chosen: Electron + TypeScript** — the owner's existing stack gives the shortest path to a
usable V1; `Tray` maps to StatusNotifierItem/AppIndicator on Linux; Docker Engine API access from the main process
(directly over its socket, ADR-0005).

### Consequences

- Good: no new language; free-form UI; mature tray + `shell.openExternal` APIs.
- Bad: ~150 MB RAM footprint — accepted for a personal tool.
- Constraint: on Linux the tray `click` event is not guaranteed to be a left click
  (Electron `tray.md`, *Platform Considerations*) → every action must be in the tray menu.

## Rejected

- Tauri: Rust toolchain not installed, learning curve contradicts "fast".
- Python + GTK: outside the owner's stack.
- GNOME Shell extension: API breaks across GNOME versions; on Wayland testing needs a
  logout or a nested shell.
