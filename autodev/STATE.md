# STATE — machine-maintained cache. If git/gh disagree with this file, git/gh win.
status: ready                # ready | BLOCKED
milestone: M3
attempts: 0                  # attempts at THIS milestone; 3 ⇒ BLOCKED
last_failure: none           # canonical signature "GATE FAIL step=<name>", or none
blocked_reason: none
last_session: 2026-06-11 M2 merged PR #3 (strong=claude-fable-5; hybrid-dev done in 0 fix rounds; review r1 codex lane timed out, Lane A alone, 0/3 confirmed — 3 nice-to-haves backlogged)
last_gate: GATE PASS @ 77106a8 (secrets, integrity, hygiene, unit 47/47, smoke-fall, smoke-playthrough)
updated: 2026-06-11

## Notes (this milestone only; wiped at close-out)
- M3 gate growth: add step=smoke-combat (orchestrator, S3g, RED — SPEC D9) + sed inversion proof over `const EXPECTED_ENEMIES_DEFEATED = <n>;`.
- M3 RED edits: src/core/world.mjs (combat resolution) and src/levels/demo.mjs v2 (new corridor level + new strong-derived single-line WIN_INPUTS); enemy.mjs is new; combat.test.mjs strong-verified.
- combat.smoke.mjs MUST assert enemyCount >= 1 at step 0 (vacuous-pass guard).
- Backlog now holds 3 M2 nice-to-haves incl. jump+slide combo — M3's knockback work touches the same input-handling region of robo/world; consider whether the combo fix rides along if it stays in budget.
