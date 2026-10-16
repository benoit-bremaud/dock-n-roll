# Local review — dock-n-roll (issue #19, dashboard served from app://)

- Date: 2026-10-16
- Commit: 7b033a4
- Scope: branch diff origin/main...feat/app-protocol
- Checks run: design · docs · tests · security · correctness
- Verdict: ship (all Should applied) · Must 0 · Should 6 · Nice 5

## Pre-merge gate (head SHA 7b033a4)
| Step | Result |
|---|---|
| 1 Tests | ✅ 532 unit/integration (vitest) |
| 2 Coverage | tests 97.03 % stmts / 91.6 % branches / 97.56 % funcs / 98.4 % lines (gate 90/85/90/90) · docs: every new export documented |
| 3 SonarQube | ✅ PASSED (after fixing S7735 negated ternary, `src/main/index.ts:30`) |
| 4 Secrets | ✅ gitleaks clean (main..HEAD) · no tracked .env · diff read: nothing sensitive |
| 5 QA pass | ✅ built app (`dist/linux-unpacked`, fuse wire `000001001` = GrantFileProtocolExtraPrivileges off): page at `app://dashboard/index.html`, JS + CSS load, IPC `getState` OK, no CSP error; `../`, `..%2f`, `%252e` → 404, `file:///etc/passwd` blocked · screenshot: `docs/architecture/qa/2026-10-16-app-protocol-dashboard.png` |
- Gate: **GREEN — merge authorised** (on owner approval)

## 🔴 Must Have
_None._

## 🟡 Should Have (all applied in 7b033a4)
- `src/main/app-protocol.ts:61` `[security|tests]` · catch-all turned EACCES / broken asar into a silent 404 · log non-ENOENT/EISDIR errors, test added
- `src/main/index.ts:235` `[security]` · `app://` handler registered in dev too · register only when serving the bundled page
- `docs/architecture/diagrams/launcher/15-sequence-dashboard-load.md:33,53` `[docs]` · claimed `%2f`/`%5c` refused; the code decodes once and refuses leftover `%`, `\`, NUL, empty/`.`/`..` segments · notes rewritten
- `src/main/trusted-sender.test.ts:35` `[tests]` · loop inside one `it` hides which URL fails · `it.each`
- `docs/architecture/decisions/0009-custom-app-protocol.md:32` `[docs]` · wrong line count · removed
- `src/main/index.ts:30` `[correctness]` · Sonar S7735 negated condition · flipped

## 🔵 Nice to Have
- `src/main/app-protocol.ts:60` `[security]` · `nosniff` header (applied); CSP as a response header too (not applied: the meta tag is the single source)
- `src/main/app-protocol.test.ts` `[tests]` · port in host (applied); `.` segment, case-variant host, directory URL rows (not applied, refused by code)
- `src/main/app-protocol.ts:5` `[docs]` · `APP_HOST` has no doc comment (private const)
- `src/main/app-protocol.test.ts:41` `[tests]` · MIME table rows borderline over-testing, kept (cheap)

## ⚪ Disagree / Intentional
- `src/main/app-protocol.test.ts:18` `[tests]` · `../` URLs resolve under the root rather than null · the WHATWG URL parser collapses dot segments before the handler; confinement is the invariant

## Per-dimension summary
- Design: pure module, injected `readFile`, thin Electron wiring · Docs: ADR-0009 + diagram 15 match the code · Tests: real functions, only the FS boundary mocked · Security: confinement sound, minimal scheme privileges, exact trusted-sender URL, fuse off · Correctness: no regression on the dev-server path
