# PITFALLS — append-only. One entry per lesson; newest first. Never edit or delete entries.
# Written on: failed attempts, gate flakes, confirmed P0s, recurring review false-positives.
# Relevant entries are pasted VERBATIM into hybrid-dev task prompts.
- 2026-06-11 (M3, review false-positive): knockback-vs-wall vx zeroing is PINNED behavior — the
  frozen test/combat.test.mjs:429 asserts vx===0 at the final window step while wall-pinned, so
  "reassert knockback vx after moveAndCollide" would RED a frozen test. Do not "fix" this in
  later milestones; D8's corridor-impassability purpose is unimpaired (pinning happens on the
  side AWAY from the enemy).
- 2026-06-11 (M3, doc-order note): the frozen test/combat.test.mjs contract HEADER prose lists
  phase order "5) projectiles … 6) enemies" and places the i-window decrement in phase 2, but
  the implementation steps enemies before projectiles and decrements AFTER combat. No assertion
  diverges; world.mjs's own step-order comment is AUTHORITATIVE over the frozen header prose —
  never re-implement step order from the test header.
- 2026-06-11 (M0): `node --test test/` hit MODULE_NOT_FOUND on this Node version when given the
  bare directory; test/index.js (committed M0) is the directory-entry shim that imports every
  test/*.test.mjs. New test files MUST keep the *.test.mjs suffix or the shim (and the gate's
  unit step) silently skips them.
- 2026-06-11 (M0, review-confirmed): gate scans written as `if <pipeline>; then fail; fi` are
  FAIL-OPEN — grep rc>=2 (scanner error) is indistinguishable from rc=1 (no matches), and under
  pipefail a failed `git ls-files` is masked by grep's rc. All future gate growth must rc-check
  fail-closed (only rc=1 passes) and stamp .autodev/gate-green BEFORE printing GATE PASS, guarded
  by `|| fail stamp`.
- 2026-06-10 (seeded at plan v2, applies to EVERY milestone): Every new test/*.test.mjs MUST be
  strong-model-authored-or-verified and `node --test test/` GREEN locally BEFORE the commit that
  introduces it; expected values are derived by RUNNING the implementation/sim, never
  hand-computed; tests freeze on first commit (oracle-integrity) — a wrong expected constant
  after the freeze is unrepairable and costs a full attempt.
