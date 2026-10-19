# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The public surface is the pin
file format (`services.yaml`) and the installed package.

## [Unreleased]

### Fixed

- Pin file: a FIFO, device or directory named `services.yaml` is refused at once ("not a regular
  file") instead of after the 5 s read timeout, and a file swapped or grown after the check is still
  refused unread (#20).
- Pin file: the size-cap error reads in KiB, like ADR-0005 (#21).
- A missing project now names what is gone: `folder /srv/x is missing` or
  `compose file /srv/x/compose.yaml is missing` (#12).

### Changed

- Docker events are published once per burst (at least every 50 events) instead of once per event:
  a `compose up` no longer rebuilds the tray menu dozens of times (#12).

## [1.1.0] - 2026-10-16

### Added

- Restart action in the menu and the dashboard: a stop then an `up`, so edits to the Compose
  file or `.env` apply (#29).
- Desktop notification when a running container of a listed service crashes (exit code other
  than 0/130/137/143, out of memory, or restarting); silent for stops you asked for, at most
  one per service per minute (#31).
- Logs panel in the dashboard: the last 500 lines of a service's container, followed live, with
  a container picker; text only (colour codes removed) (#32).

## [1.0.0] - 2026-10-15

First release.

### Added

- GNOME top-bar menu: one entry per Docker Compose project, coloured by status, with Start and
  Stop (#6).
- Dashboard window: services, containers and listening ports (#7, visual polish #10).
- Pin file `~/.config/dock-n-roll/services.yaml`: pin, hide, rename, link and health-check
  projects, reloaded on save (#5).
- Linux `.deb` package with an AppArmor profile keeping Chromium's sandbox, and a
  *Start at login* toggle (#9).
- Rootless Docker support through a `unix://` `DOCKER_HOST` (#5).
- CI builds the `.deb` and keeps it as an artifact (brick E).

### Changed

- The tray icon appears before slow initialisation (#15).
- Docker name resolution runs off the event chain; the pin watcher re-arms when its directory is
  recreated; filesystem calls time out (#17).

### Security

- Electron fuses restrict the installed binary; pin files over 64 KiB are refused unread;
  Dependabot with a 5-day cooldown; every CI job is time-bounded (#24).
- IPC trusted-sender check covered by tests, coverage gate 90/85/90/90 in CI (#26).

### Fixed

- `pnpm dist` no longer needs a `homepage` override (closes #16).

[Unreleased]: https://github.com/benoit-bremaud/dock-n-roll/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/benoit-bremaud/dock-n-roll/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/benoit-bremaud/dock-n-roll/releases/tag/v1.0.0
