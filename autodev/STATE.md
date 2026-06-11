# STATE — machine-maintained cache. If git/gh disagree with this file, git/gh win.
status: ready                # ready | BLOCKED
milestone: M1
attempts: 0                  # attempts at THIS milestone; 3 ⇒ BLOCKED
last_failure: none           # canonical signature "GATE FAIL step=<name>", or none
blocked_reason: none
last_session: 2026-06-11 M0 merged PR #1 (strong=claude-fable-5; hybrid-dev done in 1 fix round; review 2 rounds, 4/6 confirmed patched)
last_gate: GATE PASS @ 5097599 (secrets, integrity, hygiene, unit 17/17, smoke-fall; inversion proof verified)
updated: 2026-06-11

## Notes (this milestone only; wiped at close-out)
- M1 gate growth: add step=smoke-playthrough to gate.sh (orchestrator, S3g, RED — SPEC D9).
- src/levels/demo.mjs is RED (strong-authored): WIN_INPUTS derived by running the sim, single line.
- test/index.js shim globs test/*.test.mjs — keep the naming convention for new test files.
