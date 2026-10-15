# Local review — dock-n-roll (branch feat/packaging)

- Date: 2026-10-15
- Commit: 6c408b7
- Scope: branch diff `main...feat/packaging` — `.deb` packaging (electron-builder), "Start at login" XDG autostart toggle
- Checks run: design · docs · tests · security · correctness
- Verdict: Must 3 · Should 6 · Nice 6 — Must and Should resolved test-first in the following commit (owner decision: Nice deferred)

## 🔴 Must Have — all done

- `src/main/adapters/autostart.ts:9-11` `[security|correctness|tests]` · Exec escaping does not follow the Desktop Entry spec: values are string-unescaped *before* the Exec quoting rules, so `"`, `` ` ``, `$` need `\\` and a literal `\` needs four; `%` is never doubled (field codes expand even inside quotes). `autostart.test.ts:15` asserts the wrong output. No impact on the real install path (`/opt/dock-n-roll/dock-n-roll` takes the unquoted branch) · escape `%` → `%%` in both branches, quote-escape then double every backslash; test-first cases for `%`, `\`, `$`, `` ` ``.
- `src/main/controller/tray-and-background.test.ts:74` `[tests]` · `autostart: false` never tested: a truthiness regression would hide the toggle once turned off · add a case asserting `{ type: 'checkbox', checked: false }`.
- `docs/architecture/decisions/0006-deb-package-and-login-autostart.md:15-16,33`, `docs/architecture/diagrams/launcher/10-deployment.md:16`, `electron-builder.yml:1` `[docs]` · Say the package makes `chrome-sandbox` setuid; on Ubuntu 24.04 electron-builder's postinst installs the AppArmor profile `/etc/apparmor.d/dock-n-roll` instead (setuid only when user namespaces are unavailable) — confirmed by the recette (`chrome-sandbox` 0755, profile loaded, renderer sandboxed) · reword ADR option 1 and consequences, diagram node, yml comment.

## 🟡 Should Have — all done

- `src/main/index.ts:102-113` `[design|security|tests]` · A failed toggle only logs (`console.error`, invisible when packaged) and leaves the GTK checkbox flipped; two quick clicks compute `next` from the same stale value · extract a small `createAutostartToggle(set, initial, onChange)` into the controller (Electron-free, unit-tested with a fake `set`): busy guard, state updated only on success, re-render on success and failure, error surfaced via `dialog.showErrorBox`.
- `src/main/adapters/autostart.ts:18` `[security]` · Only `\r` / `\n` rejected; other control chars (NUL) give an invalid entry or a confusing error · reject `/[\x00-\x1f\x7f]/`; test with `\r` and `''` and a specific `toThrow(/…/)`.
- `electron-builder.yml` `[security]` · No Electron fuses: the binary in `/opt`, launched at every login, stays a general Node interpreter (`RunAsNode`, `NODE_OPTIONS`, inspect flags) · add `electronFuses` (runAsNode, enableNodeOptionsEnvironmentVariable, enableNodeCliInspectArguments off; onlyLoadAppFromAsar on) — verify the key via Context7 first.
- `electron-builder.yml:26-28` `[correctness]` · Deb depends on the docker CLI but not the compose plugin the app runs · add `docker-compose-plugin | docker-compose-v2`.
- `src/main/adapters/autostart.test.ts:86` `[tests]` · Missing: overwrite of an existing entry, path that is a directory (`isFile()` reason), `0o644` mode; one test covers create/detect/remove · split and add the cases.
- `src/main/adapters/autostart.ts:33-39` `[design|correctness]` · `isAutostartEnabled` = file exists: an entry disabled via `X-GNOME-Autostart-enabled=false` / `Hidden=true` shows "on" · document the limitation in one line (YAGNI) — parsing deferred.

## 🔵 Nice to Have — deferred

- `src/main/adapters/autostart.ts:44` `[security]` · Non-atomic write; `mode` only applied on create · write `.tmp` then `rename`.
- `src/main/adapters/autostart.ts:33-39` `[correctness]` · Every read error (EACCES) reported as "off" · `false` on ENOENT only.
- `electron-builder.yml:17` `[correctness]` · Debian `Maintainer` lacks an email (lintian warning).
- `src/main/index.ts:13,15` `[design]` · Import grouping (adapters before controller).
- `src/main/index.ts:114` `[design]` · `autostart === undefined ? {} : { autostart }` — keep if `exactOptionalPropertyTypes` requires it.
- `src/main/adapters/autostart.test.ts:58` `[tests]` · Whole-file equality fragile to copy changes · assert key lines.

## ⚪ Disagree / Intentional

- `src/main/controller/resources.ts` `[design]` · Pure, tested path function, not a layer — keeps `index.ts` thin.
- `src/main/adapters/autostart.test.ts` real temp dir `[tests]` · The filesystem is this adapter's job; unique `mkdtemp` per test, removed after.
- Sandbox "expect chrome-sandbox 4755" `[security]` · Wrong expectation on Ubuntu 24.04: AppArmor profile path is the intended one (see Must 3), verified in the recette.
- Duplicated `Comment=` text (autostart vs yml) `[design]` · Two occurrences, below the Rule of Three.

## Per-dimension summary

- Design: proportionate, dependency rule held; toggle wiring is the one robustness gap.
- Docs: ADR-0006 / diagram 10 state the wrong sandbox mechanism.
- Tests: healthy unit pyramid; escaping and `false` state untested, one test locks in wrong output.
- Security: Exec escaping off-spec (not exploitable on the real path); no Electron fuses.
- Correctness: missing compose-plugin dependency; silent toggle failure.
