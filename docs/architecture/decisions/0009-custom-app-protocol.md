# 0009 — Serve the dashboard from a custom `app://` protocol

- **Status**: accepted
- **Date**: 2026-10-16
- **Extends**: ADR-0006 (packaging and fuses)

## Context and problem statement

Brick C (PR #24) found that turning off the Electron fuse `grantFileProtocolExtraPrivileges`
breaks `loadFile()` of the dashboard from the asar (`ERR_FILE_NOT_FOUND`). The fuse stayed on,
so `file:` pages keep extra privileges (issue #19). Electron's security guidance is to serve
local content from a custom privileged scheme.

## Considered options

How the `app://` handler reads a file:
1. **`fs.readFile` + a closed MIME table** in a pure, Electron-free module.
2. `net.fetch(pathToFileURL(path))`, relying on the internal `file:` protocol.

## Decision outcome

Owner MCDA, 2026-10-16: **`fs.readFile` + MIME table (485/500)** over `net.fetch` (375).

- It does not depend on the `file:` protocol the fuse restricts; `fs` reads the asar
  transparently in the main process.
- Path resolution and MIME lookup are pure functions, unit-tested without Electron.

### Consequences

- Good: `grantFileProtocolExtraPrivileges` off; one origin `app://dashboard`, matched exactly
  by the trusted-sender check; path traversal refused before any read.
- Bad: a handler module of our own and a MIME table to extend if the renderer gains a new asset type.
