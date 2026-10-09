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
  limits install scripts to `esbuild` (Electron 44 has no install script: it downloads its
  runtime on first launch). Version constraints found on
  2026-10-09: electron-vite 5 requires Vite ≤ 7, typescript-eslint 8 requires TypeScript < 6.1.
- **CI baseline while private**: Gitleaks (blocking, no SARIF upload) and `pnpm audit
  --audit-level=high` (PRs + weekly). CodeQL and dependency-review need GitHub code security,
  which a private personal repository does not have: they are added when the repository
  goes public. Actions are pinned by SHA.

### Consequences

- Good: everything that runs on the machine or in CI is readable in the repository; CI is
  fully functional, with no permanently red workflow.
- Bad: no SAST while private. Mitigated by design (spec R4: `execFile`, no shell,
  `--flag=value` arguments) and by unit tests of the argument builder.
- Tool-imposed exceptions to the named-exports rule: `electron.vite.config.ts`,
  `vitest.config.ts` and `eslint.config.mjs` need a default export.
