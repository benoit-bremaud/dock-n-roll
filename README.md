# dock-n-roll

A tiny GNOME top-bar launcher for local dev services: one button per Docker Compose project —
**green = ON, red = OFF** — plus a view of everything running in the background
(containers, listening ports).

> **Status**: V1 conception validated; Electron skeleton in place (tray icon + empty dashboard).

## Development

Requirements: Ubuntu GNOME with the AppIndicator extension enabled
(`gnome-extensions enable ubuntu-appindicators@ubuntu.com`), Node.js ≥ 22.12, pnpm 10.

```bash
pnpm install
pnpm dev          # first run downloads the Electron runtime
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Conception

- Specification: [docs/architecture/specs/v1-spec.md](docs/architecture/specs/v1-spec.md)
- Decisions (ADRs): [docs/architecture/decisions/](docs/architecture/decisions/)
- UML diagrams: [docs/architecture/diagrams/launcher/](docs/architecture/diagrams/launcher/)
