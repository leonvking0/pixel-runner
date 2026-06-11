# PITFALLS — append-only. One entry per lesson; newest first. Never edit or delete entries.
# Written on: failed attempts, gate flakes, confirmed P0s, recurring review false-positives.
# Relevant entries are pasted VERBATIM into hybrid-dev task prompts.
- 2026-06-10 (seeded at plan v2, applies to EVERY milestone): Every new test/*.test.mjs MUST be
  strong-model-authored-or-verified and `node --test test/` GREEN locally BEFORE the commit that
  introduces it; expected values are derived by RUNNING the implementation/sim, never
  hand-computed; tests freeze on first commit (oracle-integrity) — a wrong expected constant
  after the freeze is unrepairable and costs a full attempt.
