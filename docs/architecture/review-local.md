# Local review — dock-n-roll (branch chore/scaffold)

- Date: 2026-10-09
- Commit: c5eb32f (reviewed), fixes in the following commit
- Scope: branch diff `docs/v1-conception...chore/scaffold` — Electron + React + TypeScript skeleton, CI workflows, ADR-0004
- Checks run: design · docs · security · correctness · tests: not applicable (no logic yet)
- Verdict: fix Must Have first · Must 3 · Should 11 (3 belong to later PRs) · Nice 6 — all Must resolved and verified

## 🔴 Must Have

- `src/renderer/index.html:7` `[design|security|correctness]` · The strict CSP blocks the React refresh inline preamble and Vite's injected `<style>` elements, so `pnpm dev` shows a blank window (builds unaffected). · Dev-only Vite plugin (`apply: 'serve'`) adds `'unsafe-inline'` to `script-src` / `style-src`; builds keep the strict policy. **Done** — verified: dev server HTML carries the relaxed CSP and the preamble, `out/renderer/index.html` keeps `script-src 'self'; style-src 'self'`.
- `src/main/index.ts:33,66` `[design|correctness|docs]` · `isQuitting` was only set by the tray Quit item: logout, SIGTERM or Ctrl+C on `pnpm dev` were cancelled by the hide-on-close handler once the dashboard had been opened. · Set `isQuitting` in `before-quit`, which runs before windows close. **Done.**
- `docs/architecture/decisions/0004-react-renderer-and-scaffold.md:21` · `pnpm-workspace.yaml:3` `[docs]` · Both claimed Electron downloads its runtime on first launch; through electron-vite 5 it does not, hence `install-electron` in `dev` / `start`. · Rewrite both with the real mechanism. **Done.**

## 🟡 Should Have

- `src/main/index.ts` `[security]` · No permission handlers: Electron grants every permission request by default (Electron security checklist item 5). · Deny all with `setPermissionRequestHandler` / `setPermissionCheckHandler`. **Done.**
- `src/main/index.ts` `[security]` · `autoHideMenuBar` only hides the default menu: Alt reveals Reload / Toggle DevTools in builds. · `Menu.setApplicationMenu(null)` when packaged. **Done.**
- `.github/workflows/*.yml` `[security]` · `actions/checkout` leaves the token in `.git/config` while third-party install scripts run. · `persist-credentials: false` on every checkout. **Done.**
- `.github/workflows/gitleaks.yml:12` `[security|docs]` · `pull-requests: write` only served PR comments; stray SARIF comment. · Permission removed, `GITLEAKS_ENABLE_COMMENTS: 'false'`, comment moved to the permissions block. **Done.**
- `docs/architecture/decisions/0004-react-renderer-and-scaffold.md:24,33` `[docs]` · SARIF wording contradicted the workflow; argument-builder tests stated in the present tense. · Reworded. **Done.**
- `src/preload/index.ts:2` `[docs]` · IPC API attributed to the spec; it comes from `03-component.md`. · Fixed. **Done.**
- `README.md:12` `[docs]` · "pnpm 10" too loose for `allowBuilds`. · Exact version from `packageManager` + `corepack enable`. **Done.**
- `src/renderer/src/styles/tokens.css:2` `[docs]` · Status → token mapping did not match spec §4. · Explicit mapping. **Done.**
- `eslint.config.mjs` `[design]` · Domain dependency rule (no Electron / dockerode / Node IO in `domain`) not enforced. · `no-restricted-imports` on `src/main/domain/**`. **Deferred to the domain PR** (the folder does not exist yet).
- `tsconfig.web.json:10` `[design]` · Renderer cannot import main-process types. · One types-only `src/shared/ipc.ts` in both projects. **Deferred to the controller/IPC PR.**
- `src/main/index.ts:56` `[design]` · Static tray menu; `index.ts` will mix lifecycle, window, tray and IPC. · Extract `buildTrayMenu(statuses, actions)` to `tray-menu.ts`. **Deferred to the controller PR.**

## 🔵 Nice to Have

- `src/main/index.ts:4` `[design|security|docs]` · Tray icon path tied to the `out/` layout; empty image when missing. · `process.resourcesPath` + `extraResources`, check `isEmpty()`. **Deferred — packaging PR.**
- `src/main/index.ts:42` `[correctness]` · `void loadURL/loadFile` swallows load failures. · Log in a `.catch`. **Deferred — backlog.**
- `src/main/index.ts:51` `[design|correctness]` · White flash on first show. · Show on `ready-to-show` or set `backgroundColor`. **Deferred — dashboard PR.**
- `vitest.config.ts:6` `[design]` · `*.test.tsx` included with a node environment; `passWithNoTests` could hide a wrong include. · Narrow include, drop `passWithNoTests`. **Deferred — domain PR.**
- `.github/workflows/dependency-audit.yml` `[correctness]` · `pnpm audit` relies on the legacy npm audit endpoint (retirement unverified); no `timeout-minutes` / `concurrency`. · **Deferred — backlog.**
- `docs/architecture/decisions/0004-react-renderer-and-scaffold.md` `[docs]` · Three decisions in one ADR, no "Considered options" section. · **Deferred — backlog** (split the CI part when the repository goes public).

## ⚪ Disagree / Intentional

- `electron.vite.config.ts` · `vitest.config.ts` · `eslint.config.mjs` `[design]` · Default exports · tool-imposed, recorded in ADR-0004 and scoped in the ESLint config.
- `tsconfig.base.json` / `node` / `web` `[design]` · Three configs · two runtimes (Node vs DOM) need different `lib` / `types`.
- `src/renderer/src/App.tsx:1` `[docs]` · No TSDoc on `App` · placeholder replaced by the dashboard PR.

## Per-dimension summary

- Design: minimal and conformant to `03-component.md`; one real lifecycle bug (quit), three seams to add in the PRs that need them.
- Docs: comments are WHY-oriented; one misleading claim (Electron download) and small wording drifts.
- Tests: not applicable — no logic yet; Vitest wired with `passWithNoTests` until the domain PR.
- Security: renderer isolation correct; permission handlers, menu removal and CI token persistence added.
- Correctness: dev CSP and quit flow fixed and verified; lint, typecheck, test, build and audit green.
