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
   removed with `apt remove`. Its post-install script installs the AppArmor profile
   `/etc/apparmor.d/dock-n-roll`, which allows user namespaces for the app; it makes
   `chrome-sandbox` setuid only where user namespaces are unavailable (not the case here).
2. AppImage — one file, no root; but under the AppArmor restriction above, Electron's sandbox
   fails to start unless the app runs with `--no-sandbox` (sandbox off) or an AppArmor profile is
   installed — which needs root anyway.
3. No package: a `.desktop` file running `pnpm start` from the repository — depends on the dev
   checkout and toolchain.

## Decision outcome

- **`.deb`**, target `deb` only (no other OS, spec §2 out of scope), version pinned.
- **Resources outside the asar**: the tray icon is shipped with `extraResources` and read from
  `process.resourcesPath` when packaged.
- **Autostart**: a "Start at login" checkbox in the tray menu writes or removes
  `~/.config/autostart/dock-n-roll.desktop` (XDG autostart; Electron's `setLoginItemSettings`
  does nothing on Linux). The entry runs the installed executable; it is per user, so it is not
  written by the package. The checkbox state changes only once the file is written; a failure is
  shown in a dialog and the checkbox snaps back.
- **Electron fuses**: the binary launched at every login must not be a general Node runtime.
  This section is the single source of the fuse rationale; `electron-builder.yml` and
  `src/main/index.ts` only point here. Per fuse (`electronFuses` in `electron-builder.yml`):

  | Fuse | Value | Why |
  |---|---|---|
  | `runAsNode` | off | `ELECTRON_RUN_AS_NODE` would turn the binary into a plain Node runtime. |
  | `enableNodeOptionsEnvironmentVariable` | off | `NODE_OPTIONS` could inject code at launch. |
  | `enableNodeCliInspectArguments` | off | `--inspect` would open a debugger on the running app. |
  | `onlyLoadAppFromAsar` | on | the app code is only read from its asar, never from a side folder. |
  | `grantFileProtocolExtraPrivileges` | off | the dashboard is served from `app://` (ADR-0009), so `file:` needs no extra privileges. Until ADR-0009 (2026-10-16) it stayed on: turning it off broke `loadFile()` from the asar (`ERR_FILE_NOT_FOUND`, brick C). `pnpm e2e:smoke` checks it on the built binary. |
  | `embeddedAsarIntegrityValidation` | default | enforced on macOS/Windows only. |
  | `cookieEncryption` | default | the dashboard keeps no session and no cookies to protect. |
- **Dependencies**: Docker CLI, the Compose plugin and `iproute2` (`ss`).

### Consequences

- Good: Chromium sandbox kept (AppArmor profile from the package — checked on the workstation:
  `chrome-sandbox` 0755, profile loaded, renderer sandboxed); standard install and removal; no
  repository needed at runtime.
- Limitation: "Start at login" reads only whether our entry exists; an entry disabled by another
  tool (`Hidden=true`) still shows as on. An entry that cannot be read (EACCES…) is never shown as
  off: the checkbox is not offered. The entry is written aside then renamed, so GNOME never reads
  half of it.
- Bad: installing needs `sudo apt install ./dock-n-roll_<version>_amd64.deb`; updates are a new
  `.deb` (no auto-update — YAGNI for a personal tool).
