# Class diagram — launcher — pure domain types and functions

> **Source specs**: `docs/architecture/specs/v1-spec.md` §3, §4, §6, §8
> **Related ADRs**: ADR-0002, ADR-0003

## Context

Types and pure functions of `src/main/domain` (component `domain` in `03-component.md`).
Everything here is data in, data out: no Electron, no Docker client, no Node IO. Adapters
(`src/main/adapters`) translate Docker / `ss` / YAML into these input types; ServiceController feeds
them back in on every change. Does not cover adapters, IPC or UI.

## Diagram

```mermaid
classDiagram
  class ContainerSnapshot {
    +string id
    +string name
    +string image
    +ContainerState state
    +number|null exitCode
    +boolean oomKilled
    +Health|null health
    +Record~string,string~ labels
    +PortBinding[] publishedPorts
  }
  class PortBinding {
    +string hostIp
    +number hostPort
    +number containerPort
    +string protocol
  }
  class ComposeLabels {
    <<union>>
    none
    valid(ComposeProjectRef)
    invalid(rawProject, rawWorkingDir, reason)
  }
  class ResolvedNames {
    <<Map workingDir to name>>
  }
  class ComposeProjectRef {
    +string name
    +string workingDir
    +string[] configFiles
  }
  class PinEntry {
    +string workingDir
    +string|undefined project
    +string|undefined name
    +string|undefined url
    +string|undefined healthUrl
    +boolean pinned
    +boolean hidden
  }
  class Service {
    +string id
    +string|null projectName
    +string workingDir
    +string[] configFiles
    +ContainerSnapshot[] containers
    +PinEntry|undefined pin
    +string displayName
    +string[] conflictingDirs
    +string|null invalidReason
  }
  class StatusInputs {
    +ContainerSnapshot[] containers
    +PendingOperation|null pending
    +boolean filesExist
    +boolean conflict
    +boolean invalid
    +HealthGate healthGate
  }
  class PinFileResult {
    +PinEntry[] entries
    +string[] errors
  }
  class Controls {
    +boolean start
    +boolean stop
  }
  class InvalidServiceError {
    <<Error>>
  }
  class ServiceStatus {
    <<enumeration>>
    invalid
    conflict
    missing
    stopping
    starting
    on
    off
    partial
  }
  class ListeningSocket {
    +string address
    +number port
    +ProcessRef|undefined process
  }
  class BackgroundPort {
    +string address
    +number port
    +PortOwner owner
  }
  class domain {
    <<functions>>
    +composeLabelsOf(ContainerSnapshot) ComposeLabels
    +isRelevant(ContainerSnapshot) boolean
    +isValidProjectName(string) boolean
    +defaultProjectName(string) string|null
    +normalizeAbsolutePath(string) string|null
    +validatePinFile(unknown) PinFileResult
    +buildServices(ContainerSnapshot[], PinEntry[], ResolvedNames) Service[]
    +deriveStatus(StatusInputs) ServiceStatus
    +allowedControls(ServiceStatus, StatusInputs) Controls
    +buildUpArgs(Service) string[]
    +buildStopArgs(Service) string[]
    +joinPorts(ListeningSocket[], ContainerSnapshot[]) BackgroundPort[]
  }

  ContainerSnapshot "1" *-- "0..*" PortBinding
  Service "1" o-- "0..*" ContainerSnapshot : relevant containers
  Service "1" o-- "0..1" PinEntry
  domain ..> ComposeLabels : reads labels into
  ComposeLabels ..> ComposeProjectRef : valid
  domain ..> ResolvedNames : reads
  domain ..> Service : builds
  domain ..> StatusInputs : derives from
  domain ..> ServiceStatus : returns
  domain ..> BackgroundPort : joins into
  domain ..> PinFileResult : validates into
  domain ..> Controls : allows
  domain ..> InvalidServiceError : throws
  PinFileResult "1" o-- "0..*" PinEntry
  BackgroundPort ..> ListeningSocket
```

## Notes

- Literal unions, not classes: `ContainerState` = Docker `State.Status`
  (`created | running | paused | restarting | removing | exited | dead`); `Health` =
  `starting | healthy | unhealthy`; `PendingOperation` = `start | stop`;
  `HealthGate` = `none | waiting | passed` (spec §3: `healthUrl` gate only when no running
  container has a `HEALTHCHECK`); `PortOwner` = `process(name, pid) | container(name) | unknown`.
- **`Service.id`** = `workingDir` + `\0` + project name; `workingDir` alone only for a
  never-started pin with no `project` key (spec §3). That id changes when the first container
  appears, so pending operations are keyed by `workingDir` + project name, not by id.
- **`conflictingDirs`** is non-empty iff the project name is used by ≥ 2 discovered working
  dirs (ADR-0003); an `invalid` project with a valid name still holds that name, but its own
  row shows `invalid`, never `conflict`. A never-started pin is flagged when a discovered project in another dir
  already uses the name it would start with — its `project`, or the name Compose derives from
  its dir (`defaultProjectName`). Only the pin is flagged: it never blocks the running
  project, and two never-started pins never flag each other.
- **`ComposeLabels`** = `none` (not a Compose container) | `valid(ComposeProjectRef)` |
  `invalid(rawProject, rawWorkingDir, reason)` (spec §10 P2). Invalid containers are grouped
  by their raw labels like valid ones; a project with ≥ 1 invalid container gets a non-null
  `invalidReason` and status `invalid` — it never disappears.
- **`ResolvedNames`** = map `workingDir → project name` produced by the adapter from
  `docker compose config` for never-started pins without `project` (spec §10 P1); the conflict
  check uses `pin.project ?? resolvedNames.get(dir) ?? defaultProjectName(dir)`.
- **Validation (spec R4)**: project names follow Compose's rule `^[a-z0-9][a-z0-9_-]*$`;
  paths are absolute, NUL-free and normalized (`/home/x/` matches the label `/home/x`). Labels
  failing these checks make the container `invalid` (see `ComposeLabels`); an invalid pin `project` drops
  the whole entry rather than widening it to the dir; duplicate pins are rejected.
- **`deriveStatus`** implements the spec §4 precedence, `on` requiring ≥ 1 relevant
  container; health is read on running containers only; the `healthUrl` gate holds a stack
  whose containers all run or are done. `allowedControls` implements the §4 Start / Stop
  columns (Start disabled while a container is `restarting` or `removing`).
- **`filesExist`** is computed by the adapter (path check is IO) and passed in, keeping
  `deriveStatus` pure.
- **`buildUpArgs` / `buildStopArgs`** produce the R4 argument arrays (`--flag=value` only,
  `--project-directory=<workingDir>`, one `--file=` per config file) and throw
  `InvalidServiceError` on an invalid name or path; for a pin with a `project` key and no
  container, `--project-name=<project>` is passed.
- **`joinPorts`** merges the IPv4 / IPv6 **wildcard** sockets of one port (observed on
  `sonarqube`: `0.0.0.0:9000` and `[::]:9000`), keeping the best-known owner (process >
  container > unknown). A container is credited only for a TCP binding on a compatible address.
  The caller passes TCP sockets only.
- Parsing `ss` text and Docker API objects stays in the adapters; the domain only sees the
  typed snapshots above.
