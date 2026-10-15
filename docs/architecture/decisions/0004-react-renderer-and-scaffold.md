# 0004 — React renderer, hand-written electron-vite scaffold, private-repo CI baseline

- **Status**: accepted
- **Date**: 2026-10-09

## Context and problem statement

The dashboard window receives live status pushes (spec UC3) and must re-render the right
rows as Docker events arrive. The project skeleton has to be created, and the repository is
private on a personal account.

## Decision outcome

- **Renderer: React + CSS design tokens.** The UI is declarative over a derived state, like
  the domain (spec §4); live updates need no hand-written DOM synchronisation. No component
  library (YAGNI): one `tokens.css` holds colours (status colours of spec §4), spacing and
  typography. Rejected: vanilla TypeScript, because live DOM synchronisation is
  error-prone code to write by hand.
- **Scaffold: hand-written electron-vite project**, no generator executed. electron-vite
  separates main / preload / renderer builds. Exact version pins; pnpm 10 `allowBuilds`
  limits install scripts to `esbuild`. Electron 44 has no install script and downloads its
  runtime lazily, but electron-vite 5 only reads `node_modules/electron/path.txt` and never
  triggers that download, so the `dev` / `start` scripts run `install-electron` first. Version constraints found on
  2026-10-09: electron-vite 5 requires Vite ≤ 7, typescript-eslint 8 requires TypeScript < 6.1.
- **CI baseline while private**: Gitleaks (blocking; SARIF kept as a job artifact, no code-scanning upload) and `pnpm audit
  --audit-level=high` (PRs + weekly). CodeQL and dependency-review need GitHub code security,
  which a private personal repository does not have: they are added when the repository
  goes public. Actions are pinned by SHA.

### Consequences

- Good: everything that runs on the machine or in CI is readable in the repository; CI is
  fully functional, with no permanently red workflow.
- Bad: no SAST while private. Mitigated by design (spec R4: `execFile`, no shell,
  `--flag=value` arguments) and, from the domain PR on, by unit tests of the argument builder.
- Tool-imposed exceptions to the named-exports rule: `electron.vite.config.ts`,
  `vitest.config.ts` and `eslint.config.mjs` need a default export.

## Amendment — renderer tests (2026-10-14)

- **React Testing Library + user-event**, in a **happy-dom** environment: components are tested
  through roles and accessible names, as a user reaches them. happy-dom over jsdom: smaller and
  faster, and enough for buttons, lists and tables (no layout or canvas needed).
- The preload API (`window.dockNRoll`) is faked at that boundary in the tests; it is typed by
  `src/shared/ipc.ts` and its main-process side is tested separately.
- Vitest runs two projects: `node` for the main process and the domain, `renderer` (happy-dom)
  for `src/renderer/**/*.test.{ts,tsx}` (`.ts` added in PR 8: a renderer `.ts` test used to run in no project).
