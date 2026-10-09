# Class diagram — launcher — pure domain types and functions

> **Source specs**: `docs/architecture/specs/v1-spec.md` §3, §4, §6, §8
> **Related ADRs**: ADR-0002, ADR-0003

## Context

Types and pure functions of `src/main/domain` (component `domain` in `03-component.md`).
Everything here is data in, data out: no Electron, no dockerode, no Node IO. Adapters
(next PR) translate Docker / `ss` / YAML into these input types; ServiceController feeds
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
  }
  class StatusInputs {
    +ContainerSnapshot[] containers
    +PendingOperation|null pending
    +boolean filesExist
    +boolean conflict
    +HealthGate healthGate
  }
  class ServiceStatus {
    <<enumeration>>
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
    +composeProjectOf(ContainerSnapshot) ComposeProjectRef|null
    +isRelevant(ContainerSnapshot) boolean
    +validatePinFile(unknown) PinFileResult
    +buildServices(ContainerSnapshot[], PinEntry[]) Service[]
    +deriveStatus(StatusInputs) ServiceStatus
    +allowedControls(ServiceStatus, StatusInputs) Controls
    +buildUpArgs(Service) string[]
    +buildStopArgs(Service) string[]
    +joinPorts(ListeningSocket[], ContainerSnapshot[]) BackgroundPort[]
  }

  ContainerSnapshot "1" *-- "0..*" PortBinding
  Service "1" o-- "0..*" ContainerSnapshot : relevant containers
  Service "1" o-- "0..1" PinEntry
  domain ..> ComposeProjectRef : reads labels into
  domain ..> Service : builds
  domain ..> StatusInputs : derives from
  domain ..> ServiceStatus : returns
  domain ..> BackgroundPort : joins into
  BackgroundPort ..> ListeningSocket
```

## Notes

- Literal unions, not classes: `ContainerState` = Docker `State.Status`
  (`created | running | paused | restarting | removing | exited | dead`); `Health` =
  `starting | healthy | unhealthy`; `PendingOperation` = `start | stop`;
  `HealthGate` = `none | waiting | passed` (spec §3: `healthUrl` gate only when no container
  has a `HEALTHCHECK`); `PortOwner` = `process(name, pid) | container(name) | unknown`.
- **`Service.id`** = `workingDir` + `\0` + project name, or `workingDir` alone for a pin with
  no container yet (spec §3). `conflictingDirs` is non-empty iff the project name is seen
  with ≥ 2 working dirs (ADR-0003).
- **`deriveStatus`** implements the spec §4 precedence, `on` requiring ≥ 1 relevant
  container. `allowedControls` implements the §4 Start / Stop columns.
- **`filesExist`** is computed by the adapter (path check is IO) and passed in, keeping
  `deriveStatus` pure.
- **`buildUpArgs` / `buildStopArgs`** produce the R4 argument arrays (`--flag=value`,
  one `--file=` per config file, absolute paths only); for a pin with a `project` key and no
  container, `--project-name=<project>` is passed (review finding E).
- **`joinPorts`** de-duplicates IPv4 / IPv6 bindings of the same host port (observed on
  `sonarqube`: `0.0.0.0:9000` and `[::]:9000`).
- Parsing `ss` text and Docker API objects stays in the adapters; the domain only sees the
  typed snapshots above.
