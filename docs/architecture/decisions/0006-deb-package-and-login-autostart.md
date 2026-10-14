# 0006 — `.deb` package via electron-builder, autostart toggled from the tray

- **Status**: accepted
- **Date**: 2026-10-14

## Context and problem statement

V1 must start with the session (spec AC1) and be installed outside the repository. Facts
checked on the workstation (2026-10-14): Ubuntu 24.04, `kernel.apparmor_restrict_unprivileged_userns = 1`
(AppArmor restricts unprivileged user namespaces, which Chromium's sandbox uses), `libfuse2t64`
present, `~/.config/autostart` exists.

## Considered options

1. **`.deb` built by electron-builder 26.15.3** — installs to `/opt/dock-n-roll`, menu entry,
   `chrome-sandbox` set setuid by the package, removed with `apt remove`.
2. AppImage — one file, no root; but under the AppArmor restriction above, Electron's sandbox
   fails to start unless the app runs with `--no-sandbox` (sandbox off) or a custom AppArmor
   profile is installed — which needs root anyway.
3. No package: a `.desktop` file running `pnpm start` from the repository — depends on the dev
   checkout and toolchain.

## Decision outcome

- **`.deb`**, target `deb` only (no other OS, spec §2 out of scope), version pinned.
- **Resources outside the asar**: the tray icon is shipped with `extraResources` and read from
  `process.resourcesPath` when packaged.
- **Autostart**: a "Start at login" checkbox in the tray menu writes or removes
  `~/.config/autostart/dock-n-roll.desktop` (XDG autostart; Electron's `setLoginItemSettings`
  does nothing on Linux). The entry runs the installed executable; it is per user, so it is not
  written by the package.

### Consequences

- Good: Chromium sandbox kept; standard install and removal; no repository needed at runtime.
- Bad: installing needs `sudo apt install ./dock-n-roll_<version>_amd64.deb`; updates are a new
  `.deb` (no auto-update — YAGNI for a personal tool).
