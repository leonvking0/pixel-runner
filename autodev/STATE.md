# STATE — machine-maintained cache. If git/gh disagree with this file, git/gh win.
status: ready                # ready | BLOCKED
milestone: M2
attempts: 0                  # attempts at THIS milestone; 3 ⇒ BLOCKED
last_failure: none           # canonical signature "GATE FAIL step=<name>", or none
blocked_reason: none
last_session: 2026-06-11 M1 merged PR #2 (strong=claude-fable-5; hybrid-dev done in 0 fix rounds; review r1 1/3 confirmed patched, r2 delta clean)
last_gate: GATE PASS @ 92bad57 (secrets, integrity, hygiene, unit 26/26, smoke-fall, smoke-playthrough; WIN_INPUTS inversion proof verified)
updated: 2026-06-11

## Notes (this milestone only; wiped at close-out)
- M2 gate growth: NONE structural — the two new test files (registry.test.mjs, abilities.test.mjs) run under the existing step=unit.
- M2 RED edits: src/characters/robo.mjs and src/core/world.mjs gain surgical strong-lane edits (kit + createCharacter('robo')); registry.mjs and projectile.mjs are new green-lane files.
- The M1 playthrough smoke must stay byte-untouched at M2 (≤6-file budget; landmine).
- test/index.js shim globs test/*.test.mjs — keep the naming convention for new test files.
