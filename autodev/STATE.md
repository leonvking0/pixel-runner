# STATE — machine-maintained cache. If git/gh disagree with this file, git/gh win.
status: ready                # ready | BLOCKED
milestone: M4
attempts: 0                  # attempts at THIS milestone; 3 ⇒ BLOCKED
last_failure: none           # canonical signature "GATE FAIL step=<name>", or none
blocked_reason: none
last_session: 2026-06-11 M3 merged PR #5 (strong=claude-fable-5; hybrid-dev done in 0 fix rounds; review r1 both lanes ran, evaluator 0/8 confirmed — 1 codex P0 false-positive, 5 nice-to-haves backlogged, 2 PITFALLS notes)
last_gate: GATE PASS @ cd44c5b (secrets, integrity, hygiene, unit, smoke-fall, smoke-playthrough, smoke-combat) + smoke-combat sed inversion proof verified
updated: 2026-06-11

## Notes (this milestone only; wiped at close-out)
- M4 gate growth: add step=serve (orchestrator, S3g, RED — SPEC D9): node autodev/smoke/serve.smoke.mjs.
- M4 files (≤6): index.html, src/shell/main.mjs, src/shell/input.mjs, src/shell/render.mjs, serve.smoke.mjs (+ at most ONE RED additive-export edit to robo.mjs or world.mjs for HUD charge/hp reads).
- serve smoke must be vacuous-pass-guarded twice: FAIL if zero JS-referenced ids extracted, FAIL if zero key strings extracted; bounded with retries + hard timeout + trap kill; no fixed shared port without fallback.
- Backlog M4 ride-along candidate: hp floor / post-loss damage skip (world.mjs) — booked to land "alongside the M4 HUD work"; it is a RED edit to world.mjs which may merge with the HUD additive-export budget line.
