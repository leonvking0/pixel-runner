#!/usr/bin/env bash
# oracle-integrity.sh — freeze the acceptance tests. A gate step (run as step=integrity).
#
# The oracle is gate.sh PLUS the test files it executes. guard rule 8 freezes gate.sh during the
# implement phase, but the test files were left mutable — so a weak-model implement pass can weaken
# the committed acceptance tests until its own generated code passes (B2/D43: the canonical
# tests-gamed-to-pass failure, caught live in the chess-tutor dogfood). The weak model writes via
# hybrid_gen.py (a python subprocess), so its writes never reach the PreToolUse guard — only a
# git-diff assertion at gate time can see the tampering, regardless of HOW the file was written.
#
# Rule enforced: acceptance-test files are author-once-then-frozen for the rest of the milestone.
#   - A test file that existed on main (prior-milestone oracle) must be byte-identical at HEAD.
#   - A test file newly added this milestone must be unchanged since the commit that introduced it
#     (adding it is fine; weakening it in a later commit is not).
# A genuinely-buggy authored test ⇒ RETRY/replan (rewrite from a fresh branch), never an in-place edit.
#
# Exit 0 = clean. On tampering: print the offenders to stderr and "GATE FAIL step=integrity"; exit 1.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "GATE FAIL step=integrity"; exit 1; }
cd "$ROOT" || { echo "GATE FAIL step=integrity"; exit 1; }

# Milestone base = merge-base with the integration branch; fall back to HEAD (nothing to compare) on day-0.
BASE="$(git merge-base origin/main HEAD 2>/dev/null || git merge-base main HEAD 2>/dev/null || echo "")"
[[ -z "$BASE" ]] && exit 0   # no base (e.g. the M0 branch before any merge) → no prior commits to weaken

# Acceptance-TEST path conventions (JS/TS/Py/Go). Scoped to unit/acceptance tests ONLY — NOT smokes.
# Smokes (autodev/smoke/) are deliberately excluded (D43-scope, B2/M4): they are strong-model (RED)
# authored, legitimately EXTENDED across milestones (e.g. M4 adds teaching-marker assertions to M3's
# serve-smoke), their initial correctness is pinned by each milestone's inversion proof, and any
# weakening shows up as a reviewed smoke edit in the diff. Freezing them would false-block the normal
# cross-milestone smoke-growth workflow. The demonstrated threat (weak model rewriting its own
# committed unit tests to pass) lives entirely in the test files below. Override with TEST_GLOB_RE.
TESTRE="${TEST_GLOB_RE:-(\.test\.[A-Za-z0-9]+$|\.spec\.[A-Za-z0-9]+$|_test\.[A-Za-z0-9]+$|(^|/)tests?/)}"

TAMPERED=""
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if git cat-file -e "$BASE:$f" 2>/dev/null; then
    # existed at the milestone base → a prior, already-merged oracle file: must be untouched
    git diff --quiet "$BASE" HEAD -- "$f" 2>/dev/null || TAMPERED="$TAMPERED $f(prior-oracle)"
  else
    # introduced during this milestone → frozen after its first commit
    first="$(git log --reverse --format=%H "$BASE..HEAD" -- "$f" 2>/dev/null | head -1)"
    [[ -z "$first" ]] && continue
    git diff --quiet "$first" HEAD -- "$f" 2>/dev/null || TAMPERED="$TAMPERED $f(weakened-after-authoring)"
  fi
done < <(git diff --name-only --diff-filter=d "$BASE..HEAD" 2>/dev/null | grep -E "$TESTRE" || true)

if [[ -n "$TAMPERED" ]]; then
  echo "oracle-integrity: acceptance tests modified after authoring —$TAMPERED" >&2
  echo "  tests are author-once-then-frozen; a buggy test ⇒ teardown + replan, not an in-place edit." >&2
  echo "GATE FAIL step=integrity"
  exit 1
fi
exit 0
