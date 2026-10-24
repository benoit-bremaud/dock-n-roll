# QA full — installed .deb 1.1.0, main with service groups (2026-10-24)

| Level | Head SHA | Environment | Targets | Agent / model |
|---|---|---|---|---|
| full | `3c49f40` (origin/main, `.deb` 1.1.0 installed at `/opt/dock-n-roll`) | local, isolated instances (own HOME / XDG, private D-Bus, Xvfb, `--ozone-platform=x11`, CDP on 127.0.0.1) | W (Electron renderer) + Linux tray (SNI / dbusmenu) | qa-tester · Opus 5.5 (product and security parts) |

## Plan

- **Level `full`**: every applicable checklist item, P0 to P2, plus a DevTools inspector review over CDP.
- **In scope**: FON, DAT, UI, A11Y, PERF, SEC, ROB, USA, PRI.
- **Out of scope**:
  - MOB: no mobile target.
  - i18n (`UI-06`): the UI is English only, so n/a.
  - The FON / DAT items for forms, money, dates, CRUD and APIs: the product has none.
- **Rules of engagement**:
  - Local only. Nothing was aimed at a third-party host.
  - The owner's own Dock'n Roll instance and containers were never touched. Only my own recorded PIDs were signalled.
  - Test stacks were tiny alpine Compose projects `qaf-*` in the session scratchpad, all taken down at the end.
- **How the app was driven**:
  - Playwright-core `connectOverCDP` for the dashboard.
  - A fake `StatusNotifierWatcher` and a fake `org.freedesktop.Notifications` on the private bus, so the tray and notifications could be driven and read (dbusmenu `GetLayout` / `Event`).
  - A URL catcher registered through `mimeapps.list`, so Open ↗ never launched a real browser.
  - `socat` in front of the Docker socket, to simulate the daemon going down, coming back or hanging.
  - `DOCKER_HOST=unix:///…/dead.sock` for "Docker unavailable".
- **Disclosure**: one early instance (run r2) started with Electron's default ozone platform. Electron picked Wayland from the owner's session, so its dashboard window may have appeared briefly on the owner's desktop. Every later run forced X11 on Xvfb (`--ozone-platform=x11`, `XDG_SESSION_TYPE=x11`, `GDK_BACKEND=x11`, no `WAYLAND_DISPLAY`). The r2 data was used for measurements only. Every screenshot below comes from an Xvfb instance at DPR 1, except 13 and 14, which were downscaled from r2.

## Results

| ID | Check | Verdict | Evidence | Issue |
|---|---|---|---|---|
| FON-01 | Nominal journey: tray → dashboard → Start / Stop / Restart / Logs / Open, groups | PASS | Restart changed `StartedAt`; Stop kept the containers; Open sent `http://localhost:1/` to the URL catcher; [01](2026-10-24-full-01-dashboard.png), [02](2026-10-24-full-02-groups-open.png) | |
| FON-02 | Paths of brick G (groups) and their failure branches | PASS | Start all / Stop all from the dashboard and the tray submenu; 12-project group on in 1.3–1.8 s; Docker-down state disables the group actions | |
| FON-03 | Boundaries of the pin file | PASS | 64 KiB cap refused with "74 KiB, max 64 KiB"; alias bomb refused; 1000 pins (45 KB) accepted | |
| FON-04 | Text in names / dirs: markup, shell metacharacters, long paths | PASS | `<b>g</b>` group, XSS strings and a `qaf-inj;touch PWNED1;…` directory are shown as text; long paths wrap. RTL and emoji names not tried | |
| FON-08 | State transitions (spec §3 as oracle) | FAIL | Group Stop of 12: 6 of 12 rows go `stopping → on → off` (50–300 ms) and the count jumps 4 → 7 → 4; reproduced twice by sampling the DOM every 25 ms. Healthcheck gate `starting → on` after 4.9 s: OK. AC5 terminal `up` shown in under 1 s: OK | #87 |
| FON-09 | Error guessing (double click, stale data) | NOT TESTED | Not run as its own probe | |
| FON-12 | Regression of the previous report | FAIL | #82 still reproduces: Beta's log panel is empty with no notice 1.5 s after opening ([04](2026-10-24-full-04-logs-panel.png)); its fix is not in `3c49f40` | #82 |
| FON-13 | Timeboxed exploratory session | NOT TESTED | No chartered session. Ad hoc exploration ran throughout and found #86 and #87 | |
| DAT-02 | Persistence | PASS | Pin file hot-reloaded on save (380 ms for a realistic file); Start at login writes and removes `~/.config/autostart/dock-n-roll.desktop` | |
| UI-01 | Viewports 320 / 390 / 768 / 1440, text zoom 200 % | FAIL | 320 and 360 px: horizontal scroll, `Open ↗` clipped ([07](2026-10-24-full-07-overflow-320.png)); 200 % zoom also overflows ([13](2026-10-24-full-13-zoom200.png)); the app's own zoom keys do nothing | #84, #89 |
| UI-02 | Console and network | FAIL | Console: no error or warning from our code; the app's `console.error` lines (`dock-n-roll:` prefix) did not appear. Network: one undocumented third-party host, see SEC-10 | #95 |
| UI-03 | Engines | N/A | Electron ships one engine (Chromium) | |
| UI-04 | Dark, forced colours, reduced motion | PASS | [06](2026-10-24-full-06-dark.png), [14](2026-10-24-full-14-forced-colors.png): in forced colours the status dots disappear but the status word stays; the app has no animation | |
| UI-05 | Every state | FAIL | Error, loading and empty states are fine, except with Docker unavailable: the summary disappears and the Groups popover is clipped ([10](2026-10-24-full-10-docker-down-groups.png)); the Running tab says "No container." | #88, #91 |
| UI-06 | i18n | N/A | English only, as designed | |
| UI-07 | Visual regression, fonts, no FOUC | PASS | Same layout as the previous report's dashboard shot (compared by eye); reload to ready in 78 ms, DCL 13 ms | |
| A11Y-01 | Keyboard only | PASS | Tab order is logical; Enter opens Groups, Esc closes it and returns focus to the summary; ArrowLeft / ArrowRight switch tabs; 2 px focus ring ([08](2026-10-24-full-08-keyboard-focus.png)) | |
| A11Y-02 | Semantics | PASS | One `h1`, `tablist` / `tab` / `tabpanel`, native buttons; axe found no violation here | |
| A11Y-03 | Errors announced | FAIL | A failed Start shows the Compose stderr in `.service__reason`: no live region, no error style, no label, newlines lost ([03](2026-10-24-full-03-failing-error.png)) | #85 |
| A11Y-04 | Contrast | PASS | Text min 6.11:1 in light, 6.5:1 in dark; badges ≥ 3:1 | |
| A11Y-05 | Target size | INCONCLUSIVE | Buttons are about 26 px high in the 1× shots; not measured with `getBoundingClientRect` | |
| A11Y-06 | Focus not obscured | PASS | No sticky element; every focused control scrolled into view during the keyboard pass | |
| A11Y-07 / 08 / 09 | Drag, authentication, consistent help | N/A | No drag, no sign-in, a single screen | |
| A11Y-10 | Easy Checks (resize text, colour) | FAIL | No zoom: `Ctrl+=`, `Ctrl+Shift+=` and `Ctrl+NumpadAdd` leave DPR at 1 (`Menu.setApplicationMenu(null)`), and fonts are in `px`. The tray shows status by emoji colour only (SC 1.4.1) | #89, #90 |
| A11Y-11 | axe-core 4.11.3 + accessibility tree | PASS | One false positive, `scrollable-region-focusable` on the log `pre` (Chromium makes it focusable, PageUp / Home / End scroll it); one incomplete, `aria-prohibited-attr` for `aria-label` on that `pre` | #94 |
| A11Y-12 | Reflow 320, text spacing, 400 % | FAIL | Reflow fails at 320 px (UI-01). 400 % and the text-spacing override were not run | #84 |
| A11Y-13 | Flashing, time limits | PASS | Nothing flashes and there is no time limit | |
| A11Y-14 | Screen reader pass | NOT TESTED | No Orca session on Xvfb | |
| PERF-01 | Lab CWV budget | N/A | Lighthouse does not apply to `app://`; desktop timings below instead | |
| PERF (desktop) | Startup, memory, idle CPU | PASS | CDP ready in 1.5–4.5 s; tray icon at 1.4–1.6 s and services in the menu at 1.65–1.75 s (3 runs); dashboard opens in 0.4–0.6 s; 26 services: PSS 329 MiB and idle CPU 0.10 % (30 s) with the dashboard open, 324 MiB and 0.26 % (60 s) with it hidden; JS heap 6.5 MiB at start | |
| PERF (scale) | 1000 pins, 12 parallel starts | PASS | 1000 pins visible 5.1 s after save; 12 351 DOM nodes; 20 scroll frames in 398 ms; idle CPU 2.1 %. 12-project group start: CPU about 11 % for a moment | |
| PERF-02 | Bundle | FAIL (Nice) | `app.asar` is 9.7 MB, of which 8.2 MB is the unused `react`, `react-dom` and `scheduler` | #93 |
| PERF-05 | 50 open / close cycles | INCONCLUSIVE | DOM stable at 344 nodes; heap 21.8 → 22.2 MB, then 22.7 → 23.2 MB; listeners 1036 → 1049 — small but steady growth | |
| SEC-01 | Security headers / CSP | PASS | Meta CSP enforced: inline script, inline style, string `setTimeout`, and external and `file:` fetches are all blocked. `app://` answers carry `content-type` + `nosniff`. `new Function` succeeded only through a CDP artefact (`allowUnsafeEvalBlockedByCSP`) | |
| SEC-02 / 03 / 07 | Cookies, origin, rate limits | N/A | No cookie; no HTTP server; the only listening port was my own CDP port | |
| SEC-04 | XSS | PASS | Markup in names, groups and log lines is shown as text in the dashboard and the tray | |
| SEC-05 | Authn / authz | N/A | Single local user; the IPC bridge is the only surface (SEC-06) | |
| SEC-06 | Input limits (IPC bridge) | PASS | Bridge frozen with 12 methods; path traversal, 1 MB strings, `__proto__`, `javascript:` URLs and wrong types all return `undefined`, with no crash and no action | |
| SEC-08 | Error leaks | PASS | Banners show local paths of the user's own socket only. The main-process stack dialog of #86 is local | |
| SEC-09 | Bundle | PASS | No source maps, no secrets, no `/home` paths; the only URLs are w3.org and react.dev | |
| SEC-10 | Third parties | FAIL | Undocumented outbound request at every launch on a fresh profile; Chromium spellchecker dictionary download | #95 |
| SEC-11 / 12 / 14 / 16 / 20 / 21 | Roles, sessions, upload, tokens, mobile, firmware | N/A | Not part of the product | |
| SEC-13 | Injection | PASS | Injection-named directory started with no `PWNED*` file created; hostile labels (`EVIL;x`, relative working dir) → `invalid`; `config_files=--version` → `missing`; `app://` traversal: 7 variants → 404; `app://other` refused | |
| SEC-15 | Business logic | PASS | Actions on `invalid` / `conflict` / `missing` services are disabled in the UI and refused through the bridge | |
| SEC-17 | Information leaks | PASS | Same evidence as SEC-09 and the `app://` traversal probes | |
| SEC-18 | Dependencies | PASS | `pnpm audit --prod` clean; the dev tree has the same 4 `fast-uri` advisories as before (2 moderate, 2 low; build only) | |
| SEC-19 | Unknown routes / verbs | PASS | Unknown bridge calls and unknown `app://` hosts are refused | |
| ROB-11 | Firmware safety | N/A | No firmware | |
| ROB-01 | Connection cut mid-session, timeout | PASS | Socket dropped mid-session → banner; hung daemon → "Docker did not answer the event stream in time" ([11](2026-10-24-full-11-docker-hung.png)) | |
| ROB-02 | Backend down | PASS | Dead socket → banner "Docker unavailable: connect ENOENT …"; every control disabled except the tabs and Open ([09](2026-10-24-full-09-docker-down.png)); recovered 29.6 s after the socket came back (backoff ≤ 30 s, spec) | #94 (retry now) |
| ROB-03 | Kill / restart, SIGTERM | FAIL | SIGTERM exits in about 112 ms and Quit from the tray in 204 ms. But once the dashboard window has been destroyed, the next Open throws "Object has been destroyed"; the modal dialog then blocks the main loop, so the tray goes dead and SIGTERM is ignored for more than 60 s ([12](2026-10-24-full-12-destroyed-window-error.png)) | #86 |
| ROB-04 | Missing or invalid config | PASS | Invalid YAML keeps the last valid pins and shows a banner; invalid entries get one banner each ([01](2026-10-24-full-01-dashboard.png)) | |
| ROB-05 | Concurrency | PASS | Single-instance lock: a second launch opens the dashboard; 12 parallel group starts | |
| ROB-06 | Malformed parser input | PASS | Binary garbage → "expected a mapping…", all pins dropped and a banner shown (acceptable: the file is unusable); alias bomb and oversize file refused | |
| ROB-07 | Logs | PASS | Only `console.error` lines prefixed `dock-n-roll:`; none were emitted during the runs | |
| ROB-08 | Clean install from README | NOT TESTED | The `.deb` was installed by the caller | |
| ROB-09 | Disk full, clock, low memory | NOT TESTED | Out of scope for this run | |
| ROB-12 | Injected latency | PASS | Hung daemon through `socat` (ROB-01) | |
| USA-01 | Heuristics | PASS (notes) | Clear status words; actions disabled when they do not apply. Polish items are in #94 | #94 |
| USA-02 | First-time user walkthrough | NOT TESTED | No formal cognitive walkthrough | |
| USA-03 | Error messages | FAIL | Start error unreadable (#85); Running tab misleading with Docker down (#91); Docker banner has no fix hint (#94) | #85, #91, #94 |
| USA-04 | Destructive actions | PASS | No destructive action: Stop keeps the containers, and there is no `down` | |
| USA-05 | Feedback ≤ 1 s | PASS | Pending states show at once; the terminal `up` shows in under 1 s | |
| USA-06 | Consistency, empty states | PASS (notes) | Nice items in #94 | #94 |
| PRI-01 | No personal data in logs / URLs | PASS | Renderer state has minimal keys, with no environment variables or secrets; localStorage, sessionStorage and cookies are empty | |
| PRI-02 / 03 | Nothing non-essential before consent; hosts match the policy | FAIL | Same root cause as SEC-10 | #95 |
| PRI-05 | Data minimisation, on disk | PASS (note) | Written under `~/.config/dock-n-roll`: the pin file plus Chromium's own Cache, GPUCache, Dawn caches and a Crashpad `client_id`; also an nssdb under `~/.local/share/pki`. No app data beyond the pin file | |
| PRI-04 / 06 / 07 | Data subject rights, mobile manifests, autocomplete | N/A | No account, no mobile app, no form | |

## Not covered

- **NOT TESTED**:
  - `A11Y-14`: needs an Orca session on a real desktop.
  - `FON-09`, `FON-13`, `USA-02`, `ROB-08`, `ROB-09`.
  - `A11Y-12`: 400 % zoom and the text-spacing override.
- **INCONCLUSIVE**:
  - `A11Y-05` (P0): target sizes estimated, not measured.
  - `PERF-05`: small heap and listener growth; a heap snapshot diff would settle it.
- **Not testable here**:
  - real GNOME tray rendering: a fake SNI watcher was used;
  - closing the dashboard with a window manager's close button: Xvfb has no WM. #86 was reproduced with `window.close()` instead.
- **N/A**: MOB, i18n, UI-03, PERF-01, and the SEC / DAT / FON items listed above.
- **No priority labels**: the repository has no priority labels. Severity is written in each issue body instead.

## Findings

1. 🔴 **Must — service actions overflow at 320 / 360 px and at 200 % zoom** (UI-01, P0) → **#84**
   - Cause: `.service__actions` is `flex: none` and does not wrap.
   - Suggested fix (in the issue): `flex-wrap: wrap`, allow it to shrink, `min-width: min(var(--actions-width), 100%)`.
2. 🔴 **Must — a failed Start / Stop is not announced and not shown as an error** (A11Y-03, P0; USA-03) → **#85**
   - No live region, no error style or label, and the Compose newlines are flattened.
3. 🔴 **Must — undocumented third-party download at every launch** (SEC-10, PRI-02 / 03) → **#95**
   - Electron's default spellchecker fetches a Hunspell dictionary from a Google host. Not exploitable, so the owner chose a public issue (MCDA A 450 vs private advisory 275); the request URL (it carries the public IP) is kept out of every file.
   - Rated Must because it breaks R4, under which "the app stays local-only".
4. 🟡 **Should — "Object has been destroyed" when the dashboard is reopened after its window was destroyed** (ROB-03) → **#86**
   - The modal dialog blocks the tray and SIGTERM.
   - Fix: `if (dashboard === null || dashboard.isDestroyed()) dashboard = createDashboard()`, plus a `closed` handler that resets the reference.
5. 🟡 **Should — group Stop flashes rows `stopping → on → off`** (FON-08) → **#87**
   - The pending entry is cleared when the command exits, before the Docker events reach the snapshot.
6. 🟡 **Should — with Docker unavailable, the summary disappears and the Groups popover is clipped** (UI-05) → **#88**
7. 🟡 **Should — no zoom in the dashboard** (A11Y-10, SC 1.4.4) → **#89**
8. 🟡 **Should — tray status is shown by emoji colour only** (SC 1.4.1) → **#90**
9. 🟡 **Should — the Running tab says "No container." while Docker is unavailable** (UI-05, USA-03) → **#91**
10. 🔵 **Nice — a never-started pin entry without `pinned: true` is listed** → **#92**
    - The spec wording and the code disagree; a decision is needed.
11. 🔵 **Nice — unused `react` / `react-dom` / `scheduler` ship in `app.asar`** (8.2 of 9.7 MB) (PERF-02) → **#93**
12. 🔵 **Nice — polish** → **#94**:
    - no icon on the crash notification;
    - Start all stays enabled when nothing can start;
    - the Docker banner has no fix hint;
    - no "Retry now" button;
    - Running tables are unsorted;
    - `role="log"` is missing on the log `pre`;
    - the autostart entry has no `Icon=`.
    - Already tracked elsewhere: the mid-word break `runni ng` (#57) and wide group names (#80).

## Delta vs previous report

Previous report: [`2026-10-24-vite8-lockstep.md`](2026-10-24-vite8-lockstep.md).
- Fixed: 0.
- Still failing: 1 (#82, re-observed in shot 04; its fix is not on main).
- New: 12 (11 public issues #84–#94, plus #95 filed after the owner chose a public issue).

## Gate line

```
| 5 QA pass | ❌ full (3 Must: #84, #85, #95) · journey: tray → dashboard → start/stop/restart/logs/open → groups · inspector: console clean, network 1 undocumented host (#95), storage empty, CSP enforced · security SEC-01…19: SEC-10 ❌ (private), rest ✅ or N/A · ⚠️ A11Y-05 INCONCLUSIVE, A11Y-14 NOT TESTED · domains: FON, DAT, UI, A11Y, PERF, SEC, ROB, USA, PRI (MOB, i18n n/a) · report: docs/architecture/qa/2026-10-24-full-installed-main.md |
```
