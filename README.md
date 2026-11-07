# dock-n-roll

A tiny GNOME top-bar launcher for local dev services: one button per Docker Compose project —
**green = ON, red = OFF** — plus a view of everything running in the background
(containers, listening ports).

> **Status**: V1 — tray menu, dashboard window, pin file and *Start at login* in place.
> Linux `.deb` only (Ubuntu GNOME). See [CHANGELOG.md](CHANGELOG.md).

## Install

Requirements: Ubuntu GNOME (tested on 24.04), Docker Engine with the Compose plugin, and the
AppIndicator extension (see [Troubleshooting](#tray-icon-does-not-appear)).

Build the package, then install it:

```bash
pnpm install && pnpm dist
```

```bash
sudo apt install ./dist/dock-n-roll_*_amd64.deb
```

No package is published: a release is a signed tag plus its [CHANGELOG](CHANGELOG.md) notes,
and the `.deb` is built from it on your machine.

> [!WARNING]
> Install only a `.deb` you built yourself from this repository. The
> package runs as root during installation (it installs an AppArmor profile), and once **Start at
> login** is ticked the app runs at every login.

Launch **dock-n-roll** from the app grid (press the Super key and type its name). The icon shows
up in the top bar; its menu lists one submenu per group (see below), then one entry per other project (🟢 ON, 🔴 OFF, 🟠 starting, stopping or
partial, ⚪ unusable) with Start/Stop/Restart, then **Open dashboard**, **Start at login** and **Quit**. In the dashboard, **Logs** shows the live logs of a service. Projects are discovered from the containers Docker knows about; pin the others (below).

## Uninstall

```bash
sudo apt remove dock-n-roll
```

`apt remove` also removes the AppArmor profile. Your own files stay; delete them by hand if you
want: the pin file directory `~/.config/dock-n-roll/` and the login entry
`~/.config/autostart/dock-n-roll.desktop` (untick **Start at login** before removing to avoid it).

## Pin file

`~/.config/dock-n-roll/services.yaml` (created by you; the directory is watched, so changes apply
on save — no restart). It lists projects to keep visible even when none of their containers
exist, and overrides how they show:

```yaml
services:
  - workingDir: /home/me/code/sonarqube-stack   # required: absolute path of the compose project
    name: SonarQube                             # label in the menu and the dashboard
    url: http://localhost:9000                  # "Open" link (http/https, no credentials)
    healthUrl: http://localhost:9000/api/system/status  # readiness check when no HEALTHCHECK
    pinned: true                                # listed even when no container exists
    groups: [QA]                                # start / stop with the rest of the group
  - workingDir: /home/me/code/noisy-thing
    hidden: true                                # never listed
  - workingDir: /home/me/code/some-app
    project: some-app-qa                        # optional: this project, from any directory (worktree, clone)
    name: Some app (QA)
```

Entries sharing a group name are listed together: the tray shows one submenu per group
(`HappiHub — 2 of 3 on`) holding **Start all**, **Stop all** and its members, and the dashboard
one collapsible section per group; ungrouped projects follow. An entry in several groups is
listed under each. Members run in parallel; one that fails shows its error on its own row and
the others carry on.

Invalid entries are skipped and the problem is shown in the dashboard; invalid YAML or a file over
64 KiB keeps the last valid pins. Full rules: [spec §8](docs/architecture/specs/v1-spec.md#8-pin-file--format-sketch).

## Troubleshooting

### Tray icon does not appear

GNOME has no tray by default. Enable the AppIndicator extension, then log out and back in:

```bash
gnome-extensions enable ubuntu-appindicators@ubuntu.com
```

On a non-Ubuntu GNOME, install *AppIndicator and KStatusNotifierItem Support* first.

### The app does not start (sandbox / AppArmor)

Ubuntu 24.04 restricts unprivileged user namespaces, which Chromium's sandbox needs. The package
installs `/etc/apparmor.d/dock-n-roll` to allow them for this app only. If the app exits at once
(run `dock-n-roll` in a terminal to see the error), check that the profile is loaded
(`sudo aa-status | grep dock-n-roll`); if the file is missing, reinstall the package, otherwise
reload it:

```bash
sudo apparmor_parser -r /etc/apparmor.d/dock-n-roll
```

Do not run with `--no-sandbox`. Background: [ADR-0006](docs/architecture/decisions/).

### No projects listed / Docker unreachable

The app reads the Docker socket `/var/run/docker.sock`; your user must be allowed to use it:

```bash
sudo usermod -aG docker "$USER"
```

Log out and back in afterwards. Note: the `docker` group is root-equivalent on this machine; prefer
rootless Docker if that matters to you. For **rootless Docker**, the app uses `DOCKER_HOST` when it is a
`unix://` path at login (for example `unix:///run/user/1000/docker.sock`); other values
(`tcp://`, `ssh://`) fall back to the standard socket. Set it in `~/.profile`, not only in your
shell's rc file, so that apps started from the desktop see it.

## Development

Requirements: Node.js ≥ 22.12, pnpm 10.30.3 (pinned in `packageManager`; `corepack enable`
provides it).

```bash
pnpm install
pnpm dev          # first run downloads the Electron runtime
pnpm dist         # builds dist/dock-n-roll_<version>_amd64.deb
```

### Local CI

Every check runs on the machine and in the git hooks; GitHub Actions runs nothing (reserved for a
future `prod.yml` publishing the `.deb` on a signed release tag; ADR-0011). The toolchain is
pinned in `mise.toml` and installed by [mise](https://mise.jdx.dev):

```bash
mise install && mise x -- just setup   # toolchain, dependencies, git hooks (once per clone)
mise x -- just check                   # L1, on every push
mise x -- just gate                    # L2, before every merge (writes the signed attestation)
```

`just --list` shows what each tier runs; [ADR-0011](docs/architecture/decisions/0011-local-first-ci.md)
says why.

`just fast` runs on every commit (staged files), `just check` on every push, `just gate` before
every merge (`just merge <pr>` refuses a head without its attestation), `just nightly` from a
systemd user timer (`scripts/systemd/`: Trivy, TruffleHog, toolchain drift). System tools:
`xvfb-run` for the smoke, `sonar-scanner` for the gate, `gh` and `ssh-keygen` for the attestation,
`notify-send` for the nightly alert, Docker optional.

## Conception

- Specification: [docs/architecture/specs/v1-spec.md](docs/architecture/specs/v1-spec.md)
- Decisions (ADRs): [docs/architecture/decisions/](docs/architecture/decisions/)
- UML diagrams: [docs/architecture/diagrams/launcher/](docs/architecture/diagrams/launcher/)
