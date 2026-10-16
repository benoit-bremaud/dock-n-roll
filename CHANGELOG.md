# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The public surface is the pin
file format (`services.yaml`) and the installed package.

## [Unreleased]

### Added

- Restart action in the menu and the dashboard: a stop then an `up`, so edits to the Compose
  file or `.env` apply.

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

[Unreleased]: https://github.com/benoit-bremaud/dock-n-roll/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/benoit-bremaud/dock-n-roll/releases/tag/v1.0.0
