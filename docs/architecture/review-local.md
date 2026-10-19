# Local review — dock-n-roll (feat/logs-follow-ups, brick E PR 3: #33 part 1)

- Date: 2026-10-19
- Scope: branch diff main...feat/logs-follow-ups
- Checks run: design · docs · tests · security · correctness
- Verdict: ship · Must 0 · Should 3 (fixed) · Nice 5 (2 applied, 3 filed)

## Pre-merge gate
| Step | Result |
|---|---|
| 1 Tests | ✅ 574 unit/integration · ✅ E2E smoke 8/8 on the `--linux dir` build |
| 2 Coverage | 97.19 % stmts / 92.16 % branches / 97.65 % funcs / 98.48 % lines (gate 90/85/90/90) |
| 3 SonarQube | ✅ PASSED (new coverage 97.9 %, 0 new issues) |
| 4 Secrets | ✅ gitleaks clean · no tracked .env · diff read: nothing sensitive |
| 5 QA pass | ✅ E2E smoke on the packaged app (ADR-0010) |

## 🔴 Must Have
_None._

## 🟡 Should Have (fixed)
- `src/main/domain/log-lines.ts` `[correctness]` · the 8000-char cut ran before the `\r` split, so a long progress line showed a stale segment · last redraw first, then the cut, for lines and for the unfinished line.
- `src/main/ipc.ts` `[docs]` · the `registerIpc` docstring sat above `IpcDeps` · moved back onto the function.
- `src/main/adapters/docker-logs.test.ts` `[tests]` · the decoder test fixes interleaved output without saying why · comment: one unfinished line for both streams.

## 🔵 Nice to Have
- `log-lines.ts` · `trimEnd` also removed spaces after a final `\r` · only `\r` is dropped now (applied).
- `log-lines.test.ts` · more `\r` cases: several, wiped line, over the cap, written in pieces (applied).
- One unfinished-line buffer per stream (stdout/stderr): filed.
- Reopen after "Service no longer listed" reproduces the same state (the row usually unmounts first): filed.
- `LogFrame.stream` typed `0 | 1 | 2`; `\r` inside an escape sequence: filed.

## ⚪ Disagree / Intentional
- An unknown id now closes the open stream: it ends the panel the user is looking at, which is the point; `asId` bounds the input.
- Diagram 14 says "brick E, PR 4" for following across restarts: owner MCDA 2026-10-19 (option C, 435).

## Per-dimension summary
- Design: frame parsing moved to adapters (dependency rule) · Docs: diagram 14, spec UC7 and order, CHANGELOG · Tests: edge cases added · Security: unchanged surface · Correctness: `\r` and decoders fixed.
