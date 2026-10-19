# Local review — dock-n-roll (fix/adapters-robustness)

- Date: 2026-10-19
- Commit: review run on 8b185a0; findings applied in the next commit
- Scope: branch diff origin/main...HEAD (docker-observer, file-probe, service-controller, MissingPath type, diagrams 05–08, CHANGELOG)
- Checks run: design · docs · tests · security · correctness
- Verdict: ship. Must 1 (applied) · Should 5 (applied) · Nice 5 (2 applied, 2 filed, 1 Disagree)

## Pre-merge gate (head SHA after the fixes)
| Step | Result |
|---|---|
| 1 Tests | ✅ 540 unit/integration (burst tests 3/3 stable) · ✅ 8/8 E2E smoke on the packaged app |
| 2 Coverage | tests 97.1 % stmts / 92.0 % branches / 97.6 % funcs / 98.4 % lines (floor 80; runner gate 90/85/90/90) · docs: new type and function documented |
| 3 SonarQube | ✅ PASSED (new coverage 97.6 %, 0 new violations, 0 % duplication) |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · no tracked .env · diff read: nothing sensitive |
| 5 QA pass | ✅ E2E smoke on the packaged binary (ADR-0010) |
- Gate: **GREEN — merge authorised** once CI is green

## 🔴 Must Have
- `src/main/adapters/docker-observer.test.ts` `[tests]` · The burst tests relied on a 50 ms inspect delay, so a slow runner could publish twice and go red · **Applied**: `FakeDockerDaemon.emitBurst` sends the burst in one write. The observer queues every event in one data callback, so the test no longer depends on timing.

## 🟡 Should Have
- `docker-observer.test.ts` `[tests]` · Only the number of snapshots was checked · **Applied**: the test waits for the final state (`db` running).
- `docker-observer.test.ts` `[tests]` · The expected count `2 + 5` was a magic number · **Applied**: removed by the rewrite.
- `service-controller.test.ts` `[tests]` · The compose-file reason was never tested through the controller · **Applied**: `missingFiles` fixture plus a test.
- `docs/architecture/diagrams/launcher/07-class-controller.md:81` `[docs]` · The diagram still showed `filesOk` · **Applied**: now `missingPaths`.
- `docs/architecture/diagrams/launcher/05-class-domain.md` `[docs]` · `MissingPath` was missing · **Applied**.

## 🔵 Nice to Have
- `service-controller.ts` `[design|correctness]` · The `?? null === null` check was duplicated and the shared source was implicit · **Applied**: `isMissing` helper with a comment.
- `docker-observer.ts` `[correctness]` · A time-based flush would cap UI lag during a long burst on a hung daemon · **Filed as #43**.
- Dashboard `[security]` · Truncate long paths in the reason and show the full path in a tooltip · **Filed as #44**.

## ⚪ Disagree / Intentional
- `src/main/domain/types.ts` `[design]` · The `kind` values double as the words shown to the user. That is kept on purpose (KISS): changing the wording means changing the type.
- #12 item 1 (absolute paths for `docker` and `ss`) · Not done, by owner MCDA (410, against 345 for resolving at startup and 340 for a fixed list). `PATH` comes from the user's own session, and a same-user attacker is already past the trust boundary. Absolute paths would break snap, rootless and `/usr/local` installs.

## Per-dimension summary
- Design: sound; adapter → domain type respects the dependency rule · Docs: diagrams 05/06/07/08 and CHANGELOG current · Tests: deterministic burst tests; reasons covered end to end · Security: nothing; full path shown is the user's own pin · Correctness: counters are scoped per sync attempt, so the final state is always published
