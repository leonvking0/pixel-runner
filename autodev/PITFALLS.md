# PITFALLS — append-only. One entry per lesson; newest first. Never edit or delete entries.
# Written on: failed attempts, gate flakes, confirmed P0s, recurring review false-positives.
# Relevant entries are pasted VERBATIM into hybrid-dev task prompts.
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
