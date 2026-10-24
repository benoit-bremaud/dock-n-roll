# QA pass — Vite 8 + electron-vite 6 + @vitejs/plugin-react 6 lockstep (#52) (2026-10-24)

| Level | Head SHA | Environment | Targets | Agent / model |
|---|---|---|---|---|
| pass | 4e76e67 (`chore/52-vite8-lockstep`) | local — packaged `dist/linux-unpacked/dock-n-roll` under `xvfb-run`, temp `XDG_CONFIG_HOME`, CDP on 127.0.0.1 (playwright-core `connectOverCDP`), real Docker | W (Electron renderer), desktop app | qa-tester · Opus 5.5 (product and security parts in one run) |

**Plan.** The diff only bumps `vite` 7.3.7 → 8.3.4, `electron-vite` 5.0.0 → 6.0.0 and
`@vitejs/plugin-react` 5.2.0 → 6.1.2 (bundler swap to Rolldown; `package.json` + lockfile). The
risk is in the build output, so the pass covers: the bundle loads under the strict CSP, React
renders, the dashboard features work end to end, no console / CSP error, `contextIsolation` and
`sandbox` intact, `app://` confinement. Domains in: FON, UI, A11Y (P0), SEC, ROB (start).
Domains out: DAT (no API / persistence change; the pin file is read-only here), PERF beyond
bundle size (no runtime change), MOB (not mobile), PRI (no data flow change), USA (no UX change).

**Rules of engagement.** Hosts: the local app (`app://dashboard`) and `127.0.0.1` CDP only;
`https://evil.test` used only as a blocked target (never reached). No account. Docker actions only
on two scratch compose projects (`qa52-alpha`, `qa52-beta`, alpine), removed afterwards; the
owner's other projects shown in the list were never started or stopped.

**Build provenance.** The packaged `app.asar` holds `out/renderer/assets/index-6S_H74Ur.js`
(587 033 B), identical in size to `out/` built with the installed `vite` 8.3.4 /
`electron-vite` 6.0.0 / `@vitejs/plugin-react` 6.1.2. Compared with the Vite 7.3.7 build of `main`
(3c49f40, worktree `bold-swanson-6e2ee0`): CSS byte-identical (same hash `index-CZ4-9DgC.css`),
`index.html` differs only by the JS hash, renderer JS 659 567 → 587 033 B (gzip 117 440 →
112 914 B, −4 %), main 77.6 → 94.0 kB (JSDoc comments kept by Rolldown, not minified before
either), preload still CommonJS (`require("electron")`) as a sandboxed preload must be.

## Results

| ID | Check | Verdict | Evidence | Issue |
|---|---|---|---|---|
| ROB start | Packaged app starts, tray app, 2nd launch opens the dashboard (single-instance) | PASS | CDP `/json/list`: one page `app://dashboard/index.html`, title `dock-n-roll` | |
| FON-01 | Nominal journey: list → Start → Restart → Logs → Stop | PASS | `2026-10-24-52-vite8-1-dashboard.png`, `-3-group-on.png`, `-5-logs.png`; Restart changed the container `StartedAt` (12:09:55Z → 12:10:41Z) | |
| FON-02 | Groups from the pin file: Start all QA52 (both up in 1.1 s, `3 of 8 on`), Stop all Beta-only (only beta stops), Stop all QA52 (`docker ps` empty) | PASS | `-2-groups-open.png`, `-3-group-on.png`, `-4-beta-only-stopped.png`; `docker ps --filter name=qa52` after each step | |
| FON-02 | Failure branch: a service whose command fails shows the compose output and exit code under its row, logs show `Log stream ended` + Reopen | PASS | `-5-logs.png` | |
| FON-02 | Running tab lists every container on the machine | PASS | `Containers` table rendered (text extract) | |
| E2E smoke | `e2e/smoke.mjs` on the packaged binary (fuse, URL, title, React root, bridge, Groups menu, console clean, 200 / 404) | PASS | 9 × `ok`, exit 0 (run with a short `TMPDIR`: a scratch path > 107 chars makes Chromium's `SingletonSocket` path too long — environment, not product) | |
| UI-02 | Console and network after reload and the journey | PASS | 0 console messages of any level; network: 3 requests, all `200` on `app://dashboard` (index.html, JS, CSS); no other host | |
| UI-01 | Narrow widths 360 and 320 px | PASS | `scrollWidth` 345 / 305 < viewport, no element overflowing; `-8-narrow-360.png` | |
| UI-04 | Dark scheme | PASS | body `rgb(13,17,23)` / text `rgb(230,237,243)`, muted `rgb(145,152,161)` (≈ 6.9:1); `-7-dark.png` | |
| UI-05 | States: empty log stream | FAIL (pre-existing) | Logs on a running container that printed nothing: blank grey bar, no notice (`LogPanel.tsx` has no zero-line state) | #82 |
| UI-07 | Visual regression vs the 2026-10-24 #77 screenshots | PASS | same layout; CSS file byte-identical to the Vite 7 build | |
| A11Y-01 | Keyboard: Tab order Groups → tab → row actions; Enter opens Groups, Esc closes it and keeps focus on the summary; ArrowRight / ArrowLeft switch tabs; visible focus (2 px solid ring, Groups summary `auto` ring) | PASS | `-6-keyboard-focus.png`; Tab-order dump | |
| A11Y-02 | Semantics: one `h1`, `main`, `tablist "Views"` + `tabpanel`, `lang="en"`, every button named (`Start qa52-alpha`, `Logs of …`, `Start all QA52`) | PASS | Playwright `ariaSnapshot` | |
| A11Y-04 | Contrast, light | PASS | min 6.11:1 (muted text, disabled buttons on white); body text 15.8:1; primary button 15.8:1 | |
| A11Y-05 | Target size ≥ 24 px | PASS (spacing exception) | Only the Groups summary is 57 × 20 px; no other target within 24 px of it. Unchanged since #77 | |
| SEC-01 | CSP | PASS | meta CSP unchanged: `default-src 'self'; script-src 'self'; style-src 'self'; …; object-src 'none'; base-uri 'none'; form-action 'none'`. Enforced: injected inline `<script>` blocked (`script-src-elem`), inline `<style>` blocked, `setTimeout('…')` string blocked (`unsafe-eval` not allowed), `fetch('https://evil.test')` blocked (`connect-src`). Bundle has 0 inline scripts, 0 inline styles, no `eval` / `new Function` | |
| SEC-02 | Cookies / storage | N/A | No cookie; `localStorage` and `sessionStorage` empty | |
| SEC-03 | Origin / CORS | N/A | No HTTP server; `app://other/…` and `file:///etc/passwd` refused by CSP before any load | |
| SEC-04 | XSS | PASS | Pin-file `name: '<img src=x onerror=alert(1)>"><svg onload=alert(1)>'` and a log line with markup render as text: 0 `img`, 0 `svg`, 0 `b` elements in the DOM | |
| SEC-05 | Isolation (contextIsolation / sandbox / bridge) | PASS | renderer: `require`, `process`, `module`, `ipcRenderer`, `electron` all `undefined`; `window.dockNRoll` frozen, 12 documented methods only; renderer process runs with `--enable-sandbox`, no `--no-sandbox`; `will-navigate` to `https://evil.test` prevented (URL unchanged), `window.open` denied (1 page) | |
| SEC-06 | Input limits on the bridge | PASS | `start('../../etc')`, `start({})`, `startGroup('x' × 100 000)`, `openUrl('javascript:alert(1)')` → `undefined`, no crash, no Docker action | |
| SEC-07 | Rate limits | N/A | Local IPC to the user's own Docker; no network surface | |
| SEC-08 | Error leaks / `app://` confinement | PASS | `200` for `index.html` and `/`; `404` with empty body for `..%2f..%2fetc%2fpasswd`, `%2e%2e/%2e%2e/etc/passwd`, `assets/..%2f..%2f..%2fpackage.json`, `..%5c..%5cpackage.json`, `%2fetc%2fpasswd`, `../main/index.js`, `nope.js` | |
| SEC-09 | Bundle | PASS | no `sourceMappingURL` in renderer / main, no secret, no `/home/vev` path; URLs only `react.dev/errors` and W3C namespaces (same as Vite 7) | |
| SEC-10 | Third parties | PASS | network list: `app://dashboard` only | |
| SEC-18 | Dependencies | PASS (no new advisory) | `pnpm audit --prod`: none. Dev tree: 4 advisories (2 moderate, 2 low) on `fast-uri@3.1.8` via `electron-builder > app-builder-lib > ajv` — same version on `main`, build-time only, not in the asar | see Not covered |

## Not covered

- **PERF-01** (Lighthouse / trace): not run — the diff changes no runtime code and the renderer
  bundle shrank; Lighthouse does not apply to an `app://` Electron page as-is.
- **UI-03** (Firefox / WebKit): N/A — Electron ships Chromium only.
- **Tray menu** (native GTK menu under Xvfb) not driven: CDP cannot reach it; the group actions it
  calls are the same controller methods exercised from the dashboard. The bump does not touch
  `src/main` source.
- **`fast-uri` dev-dependency advisories**: pre-existing on `main`, not caused by this diff;
  Dependabot alerts are disabled on the repository (API 403). Not filed as a public issue (public
  repository: security findings go through the owner); for the owner to decide (Dependabot or a
  `pnpm.overrides` bump of `fast-uri`).

## Findings

1. Should — empty log stream shows a blank panel (UI-05, pre-existing, out of the diff's scope) → #82.
   Seen: Logs on a running service whose container printed nothing gives an empty grey bar,
   with no notice. Expected: "No output yet — new lines appear here." (and "Opening…" before the
   first state). Repro: pin a compose project running `sleep infinity`, Start, Logs. Suggested
   change (not applied) in `src/renderer/src/components/LogPanel.tsx`:
   ```diff
   -        {logs?.lines.join('\n')}
   +        {logs === null ? 'Opening…' : logs.lines.length === 0 && logs.ended == null ? 'No output yet — new lines appear here.' : logs.lines.join('\n')}
   ```
2. Nice (no issue, no action needed) — Rolldown keeps JSDoc comments in `out/main/index.js`
   (+16 kB unminified, 116 blocks). No security effect (public source, no path or secret); only
   worth a `build.minify` / comment option if the asar size ever matters.

No Must. Nothing introduced by the bump failed.

## Delta vs previous report

Previous QA proof: brick G (#77), `docs/architecture/review-local.md` § 5 and the
`2026-10-24-77-groups-*.png` screenshots (no written report). Fixed 0, still failing 0, new 1
(#82, pre-existing behaviour first noticed here, not a regression).

## Screenshots

`2026-10-24-52-vite8-1-dashboard.png` · `-2-groups-open.png` · `-3-group-on.png` ·
`-4-beta-only-stopped.png` · `-5-logs.png` · `-6-keyboard-focus.png` · `-7-dark.png` ·
`-8-narrow-360.png` (all under `docs/architecture/qa/`; they show local scratchpad paths and the
names of local compose projects, no secret).

## Gate line

```
| 5 QA pass | ✅ pass · packaged build 4e76e67 + real Docker: list → Start/Restart/Logs/Stop, Groups Start all QA52 / Stop all Beta-only / Stop all QA52, Running tab · inspector: console 0 messages, network 3 × 200 on app:// only, storage empty · security: CSP enforced (inline script/style, string eval, external connect blocked), XSS as text, sandbox + contextIsolation intact, app:// traversal 404 ×7, bundle clean · e2e smoke 9/9 · domains: FON, UI, A11Y, SEC (DAT/PERF/PRI n/a: build-tool bump only) · 1 Should pre-existing → #82 · report: docs/architecture/qa/2026-10-24-vite8-lockstep.md |
```
