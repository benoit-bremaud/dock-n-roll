# 0003 — Service discovery from Compose labels + pin file

- **Status**: accepted
- **Date**: 2026-10-09

## Context and problem statement

The tool must know which services exist without manual declaration of every project, while
letting the owner pin favourites, rename, add URLs and hide noise.

Compose labels every container with `com.docker.compose.project`,
`com.docker.compose.project.working_dir` and `com.docker.compose.project.config_files`.

Observed on the workstation (2026-10-09): project name `sonarqube` is used by two different
working dirs (`02_personal/sonarqube-stack` and `02_personal/dev-infra/sonarqube`).

## Decision outcome

- A service is discovered from any container (running or stopped) carrying Compose labels;
  one-off containers (`com.docker.compose.oneoff=True`) are ignored.
- **Identity = (project name, working dir)**. When a project name maps to ≥ 2 working dirs,
  the service is shown with status `conflict` and its controls are disabled, because
  `docker compose --project-name=<name>` would act on containers of both folders.
- The pin file (`~/.config/dock-n-roll/services.yaml`, watched) overrides by `workingDir`,
  or by `project` when the entry names one (amended 2026-11-06, #99, see below; one dir may
  host several projects, e.g. `-p qa1` /
  `-p qa2`): `name`, `url`, `healthUrl`, `pinned`, `hidden`. `url` / `healthUrl` must be
  `http:` or `https:`.

### Consequences

- Good: zero config for new projects; real-world collision handled explicitly.
- Bad: a project never started (no container yet) is invisible until pinned — accepted
  for V1. Pinning its `workingDir` makes it appear as `off`; it is identified by that dir
  until its first container is seen, and started with Compose defaults (ADR-0002).

## Amendment 2026-11-06 — a pin naming a project follows it (#99)

The same compose project is often started from several dirs of one app (a git worktree, a
second clone), so the pin stayed `off` next to an unpinned running copy. A pin with `project`
now covers that project **whatever dir it runs from**; its `workingDir` is only where a
never-started pin is started. Identity is unchanged: each running dir is still one service,
and ≥ 2 dirs running the name still show `conflict`. Pin precedence for a discovered project:
the pin of its dir naming it, then any pin naming it (first in file order), then the dir-only
pin of its dir. A hidden project pin hides that project in every dir. Rejected: detecting git
worktrees (`git rev-parse --git-common-dir`; covers worktrees only, adds a git call) and an
opt-in `anyDir` key (same effect, one more key) — owner MCDA 450 / 335 / 445.
