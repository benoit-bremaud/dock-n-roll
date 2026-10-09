# Local review — dock-n-roll (branch feat/domain)

- Date: 2026-10-09
- Commit: 0488ccb (reviewed), fixes in the following commit
- Scope: branch diff `chore/scaffold...feat/domain` — pure domain `src/main/domain`, tests, class diagram, lint/test config
- Checks run: design · tests · security · correctness · docs
- Verdict: fix Must Have first · Must 6 · Should 10 · Nice 7 — Must and Should resolved (owner decision: Nice deferred)

## 🔴 Must Have

- `src/main/domain/derive-status.ts:35` `[design|tests|correctness]` · An init job exited 0 made `allRunning` false, so the `healthUrl` gate was skipped: SonarQube + migration showed `on` before ready. · Gate on "all running or done"; spec §3 wording aligned. **Done** — test "waits for the healthUrl gate even when an init job is done".
- `src/main/domain/compose-labels.ts:11` · `pin-file.ts:26` · `service-catalog.ts:40` `[design|tests|security]` · Paths neither validated nor normalized: relative or NUL label paths accepted; pin `/home/x/` ≠ label `/home/x` produced a phantom never-started row whose Start could raise a second stack. · `normalizeAbsolutePath` in labels and pins; `composeProjectOf` returns `null` on invalid paths. **Done**.
- `src/main/domain/compose-labels.ts:10` · `pin-file.ts:31` · `compose-args.ts:13` `[security|design]` · Project names never validated: an empty label gave `--project-name=` (Stop on another project); an invalid pin `project` was dropped, widening the pin to the whole dir. · Compose rule `^[a-z0-9][a-z0-9_-]*$` in labels, pins (entry rejected) and argument builder. **Done**.
- `src/main/domain/service-catalog.ts:71` `[security|correctness]` · A never-started pin whose project name already runs from another dir got no conflict, so Start was enabled and `up -p` would take over those containers. · Conflicts computed with the name the pin would start under (`project` or `defaultProjectName(dir)`). **Done**.
- `src/main/domain/compose-args.ts:26` · `types.ts:57` · `05-class-domain.md` `[docs|design]` · Throws undocumented; `Service.id` rule wrong in code doc and diagram. · `@throws` added; id rule and its instability documented (pending operations keyed by dir + project). **Done**.
- `src/main/domain/service-catalog.test.ts:76,86` · `compose-args.test.ts:46` `[tests]` · No length assertion on pin merges; `toContain` on the R4 invariant. · Exact assertions, plus the "pin narrowed to another project" case. **Done**.

## 🟡 Should Have

- `pin-file.ts` `[design|security]` · Duplicate pins → duplicate service ids. · Rejected with a message. **Done**.
- `derive-status.ts` `[design]` · "`healthUrl` only without HEALTHCHECK" enforced outside the domain. · Enforced in `deriveStatus`. **Done**.
- `derive-status.ts` `[security|correctness]` · Stale health on a stopped container kept `starting`. · Health read on running containers only. **Done**.
- `derive-status.ts` `[design|security|tests]` · `restarting` / `removing` / `paused` / `unhealthy` → `partial` with Start enabled. · Start disabled while a container is `restarting` or `removing`; spec §4 states the cases; tests pin them. **Done**.
- `service-catalog.ts:88` `[design]` · Sort not deterministic on ties. · Tie-break by display name then id. **Done**.
- `port-join.ts` `[design|security]` · First socket wins on merge; owner matched on host port only (UDP and other addresses credited). · Best-known owner kept; TCP + compatible address only. **Done**.
- `pin-file.ts` `[security]` · URLs validated on the parsed form but stored raw; credentials accepted. · Store `URL.href`; reject credentials. **Done**.
- `compose-args.ts` `[security]` · No `--project-directory`; inherited `COMPOSE_*` env could redirect the command. · `--project-directory` added; env stripping recorded in ADR-0002 for the runner (adapters PR). **Done** (env part tracked for the adapters PR).
- `*.test.ts` `[tests]` · Missing cases: stopped-only discovery, config-file merge and trim, hidden fixture defaults, pin-file branches, exact error messages. · Added. **Done**.
- `types.ts` · `05-class-domain.md` · `PROJECT_LOG.md` `[docs]` · Type contracts, undefined diagram types, `allowedControls` / `joinPorts` contracts, key count, `--wait-timeout` form. · Documented. **Done**.

## 🔵 Nice to Have

- `compose-labels.ts` `[security]` · Config paths containing commas or spaces split wrongly. · **Deferred — backlog.**
- `port-join.ts` `[correctness]` · `[::ffff:0.0.0.0]` not treated as wildcard; paused containers' ports shown `unknown`. · **Deferred — backlog.**
- `pin-file.ts` `[security]` · Keys inherited from the prototype pass validation (`Object.hasOwn`). · **Deferred — to settle with the YAML parser choice (adapters PR).**
- `service-catalog.ts` `[design]` · Config-file merge order follows container list order. · **Deferred — note in ADR-0002 if it ever matters.**
- `eslint.config.mjs` `[docs]` · Comment omits `yaml` and parent imports. · **Deferred — backlog.**
- `compose-labels.ts:24` `[docs]` · WHY of the `'True'` literal. · Done in passing (one comment line).
- `service-catalog.ts` `[docs]` · Ordering contract in the doc comment. · Done in passing (rewritten with the tie-break).

### Verification pass (security reviewer, re-ran probes on 4f847e1)

Findings 1–11: 10 resolved, 1 partially (`paused` / `unhealthy` stay `partial` with Start enabled, as now stated in spec §4).

| New finding | Severity | Response |
|---|---|---|
| N1 — a never-started pin elsewhere put the running project in `conflict` (Stop blocked); two never-started pins blocked each other | 🔴 Must | done — only the pin is flagged, against discovered projects only (2 red tests, then green) |
| N2 — `defaultProjectName` ignores the compose file `name:` / `COMPOSE_PROJECT_NAME` | 🟡 Should | see owner decision below |
| N3 — one bad label hides a whole project, or one of its containers | 🟡 Should | see owner decision below |
| N4 — prototype keys read by the pin validator | 🔵 Nice | deferred — same item as above (YAML parser choice) |
| N5 — `::ffff:` addresses, wildcard socket credited to a loopback-bound container, paused containers | 🔵 Nice | deferred — backlog |

## ⚪ Disagree / Intentional

- `compose-args.ts:7` `[design]` · `InvalidServiceError` class in a pure domain · no IO; now in the class diagram.
- `derive-status.ts` `[design]` · `idle` checked for `on` / `partial` although unreachable today · cheap guard against future precedence changes.
- `src/main/domain/test-fixtures.ts` `[design]` · Fixtures beside the domain · imported by tests only, never bundled.

## Per-dimension summary

- Design: structure unchanged and conformant; four business-rule defects fixed.
- Tests: 60 → 131 pure unit tests; exact assertions on security invariants and user-facing messages.
- Security: Compose name rule and path normalization close label / pin injection and project takeover.
- Correctness: health gate, stale health and unstartable states fixed.
- Docs: types, class diagram, spec §3 / §4 / R4 and ADR-0002 aligned with the code.
