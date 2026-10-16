# Component diagram — launcher — dashboard window (renderer)

> **Source specs**: `docs/architecture/specs/v1-spec.md` §4 (statuses, colours, banner), UC1–UC5
> **Related ADRs**: ADR-0004 (React + CSS design tokens)
> **Contract**: `src/shared/ipc.ts` (`DockNRollApi`, `ControllerState`, `BackgroundView`), class diagram 07

## Context

The React page shown in the dashboard window. It only renders what the main process pushes
and sends ids back: every rule (statuses, allowed controls, reasons) is already decided by
the controller. Does not cover the tray menu (07) or packaging (PR #9).

## Diagram

```mermaid
flowchart TB
  subgraph Renderer ["src/renderer/src"]
    Root["Root — explains a missing preload API"]
    App["App — header summary, tabs Services / Running (WAI-ARIA tabs)"]
    Format["format.ts — shortenPath, runningSummary (pure)"]
    Hook["useControllerState(api) — subscribe, then getState"]
    Banners["Banners — Docker unavailable, pin-file errors"]
    Row["ServiceRow — badge, name, dir, reason, Start / Stop / Restart / Logs / Open"]
    LogPanel["LogPanel — container picker, pre of lines, Reopen"]
    Running["RunningTab — containers and ports, refresh"]
    Css[/"styles/global.css — status to colour mapping"/]
    Tokens[/"styles/tokens.css — design tokens"/]
  end
  Api[["window.dockNRoll (preload)"]]
  Root --> App
  App --> Hook
  App --> Banners
  App -->|"services.map"| Row
  App --> Running
  App --> Format
  Row --> Format
  Hook --> Api
  Row -->|"start(id) / stop(id) / openUrl(id)"| Api
  Running -->|"listBackground()"| Api
  Row -->|"Logs toggles"| LogPanel
  LogPanel -->|"onLogsChanged, openLogs(id, container) / closeLogs()"| Api
  Row --> Css
  Css --> Tokens
```

## Wireframe

```text
┌ dock-n-roll ─────────────────────────────────────────────────┐
│ dock-n-roll                                      2 of 4 on    │  ← summary, hidden while Docker is down
│ Services   Running                                            │  ← underlined active tab
│ ────────                                                      │
│ Docker unavailable: connect ENOENT /var/run/docker.sock       │  ← banner, only when down
│ services.yaml: bad indentation at line 3                      │  ← banner, pin-file errors
│                                                               │
│ ● projet-ind-2-inscription   ~/…/docker-mysql      [Stop]     │  green
│ ● happihub-docker-audit      ~/…/happihub          [Start]    │  red
│ ● SonarQube                  ~/…/sonarqube-stack   (greyed)   │  grey
│     project name also used by ~/…/dev-infra/sonarqube         │  ← reason line
│ ● Blog              ~/…/blog   [Stop] [Restart] [Logs] [Open ↗]│  orange while starting
│   ┌ Logs — app-web-1 ▾ ──────────────────────────────────────┐ │  ← one panel at a time
│   │ listening on :3000                                        │ │  ← text only, last 500 lines
│   │ GET / 200                                                 │ │
│   └───────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

## Notes

- **`useControllerState`** subscribes with `onStateChanged` **before** calling `getState`
  (contract of `DockNRollApi`); a push always wins over the initial read, also across a
  StrictMode re-run; a failed read shows an alert; it unsubscribes on unmount.
- **Docker unavailable**: rows are greyed without badge or status word (spec §4) — the last
  known status may be wrong; every control is already off in the pushed state.
- **Banners**: one `role="alert"` region stays mounted, so an unchanged message is not announced
  again on every push.
- **`Root`** shows an alert instead of a blank window when `window.dockNRoll` is missing (wrong
  preload path in a packaged build).
- **Buttons mirror `controls`** exactly; the main process re-checks anyway. A clicked button
  shows no optimistic state: the next pushed state (orange `starting`) is the feedback.
- **Badge = status colour token** (`--status-on`, `--status-off`, `--status-transitional`,
  `--status-unavailable`, spec §4), plus the status word for screen readers and colour-blind
  users — colour is never the only signal.
- **Running tab** calls `listBackground()` when opened and on a Refresh button (the main
  process caches it for 1 s); no polling. An older answer arriving after a newer one is
  ignored; a failed scan and an empty result are said in words.
- **Accessibility**: WAI-ARIA tabs pattern (tabpanel, one tab stop, arrow keys / Home / End);
  buttons are real `<button>`s with the service name in their accessible label ("Start Blog");
  visible focus; disabled buttons borderless and muted (PR #10, replaces the dashed style).
- **Paths** are shown with the home folder as `~` (`shortenPath`, using `ControllerState.homeDir`:
  the sandboxed renderer cannot read it itself); the full path stays in the row's `title`.
- **Visual hierarchy** (PR #10): the one allowed Start is the filled button; disabled buttons stay
  in place (aligned columns, spec UC2) but quiet — borderless, muted, still `disabled`. Banners
  are a tinted block, no side stripe.
- **LogPanel (UC7, diagram 14)**: subscribes with `onLogsChanged` before `openLogs`; one panel
  open at a time (opening another closes the first); lines in a `<pre>` as text, scrolled to
  the bottom unless the developer scrolled up; a picker when the service has several
  containers; "Stream ended — Reopen" when the stream ends; `closeLogs` on close and unmount.
- Text from Docker and the pin file is rendered as React text (escaped), never as HTML.
- **Served from `app://dashboard/`** (ADR-0009, diagram 15): the built page and its assets come
  from the main process's `app://` handler, confined to `out/renderer`; `'self'` in the CSP is
  that origin.
