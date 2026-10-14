# Sequence diagram — launcher — pin file changed

> **Source specs**: `docs/architecture/specs/v1-spec.md` §3, §9 Q1, §10 P1
> **Related ADRs**: ADR-0002, ADR-0003, ADR-0005

## Context

The one recomputation path that involves several async inputs: the owner edits
`services.yaml`, names are re-resolved, files re-probed, then views are pushed. Docker
snapshots follow the same tail (from "recompute") without the resolution step.

## Diagram

```mermaid
sequenceDiagram
  actor Dev as Developer
  participant PF as PinFileStore
  participant SC as ServiceController
  participant CR as ComposeRunner
  participant FP as FileProbe
  participant D as domain
  participant Out as IPC push and TrayMenu

  Dev->>PF: save services.yaml
  PF-->>SC: onChange(entries, errors)
  SC->>SC: pins = entries
  par each pin without project
    SC->>CR: resolveProjectName(workingDir)
    CR-->>SC: name or null
  end
  SC->>SC: resolvedNames = results
  SC->>D: buildServices(containers, pins, resolvedNames)
  D-->>SC: services
  par each service
    SC->>FP: filesExist(workingDir, configFiles)
    FP-->>SC: true or false
  end
  SC->>D: deriveStatus and allowedControls per service
  D-->>SC: status and controls
  SC-->>Out: services changed (ServiceView list)
```

## Notes

- Recomputations are serialized and each one reads the latest inputs when it starts: results
  publish in order, so an older recomputation can never publish after a newer one. Only names
  of pin dirs not resolved yet are fetched.
- Pin-file errors are shown (dashboard banner) but never clear the last valid pins — that is
  `PinFileStore`'s contract.
