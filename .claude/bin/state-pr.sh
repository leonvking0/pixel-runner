#!/usr/bin/env bash
# state-pr.sh — the deterministic docs-only state PR (D33). Edit autodev/*.md on main FIRST,
# then call this. Usage: state-pr.sh "<commit message>"
# Merges via the guard's autodev/state-* exemption (docs-only diff verified server-side).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
MSG="${1:?usage: state-pr.sh <commit-message>}"
BR="autodev/state-$(date -u +%Y%m%dT%H%M%SZ)"
git checkout -b "$BR"
git add autodev/STATE.md autodev/PITFALLS.md autodev/PLAN.md autodev/SPEC.md   # SELECTIVE — never -A; SPEC for /autodev-plan
# self-verify the staged set is docs-only BEFORE the merge: state-pr.sh's own `gh pr merge` runs as a
# child of this script and so bypasses the PreToolUse guard — this is the in-script equivalent of guard
# rule 4's docs-only fence (build-review G9). Any non-autodev/*.md staged path is a hard stop.
if git diff --cached --name-only | grep -Ev '^autodev/(STATE|PITFALLS|PLAN|SPEC)\.md$' | grep -q .; then
  echo "state-pr.sh: refusing — staged set is not docs-only:" >&2
  git diff --cached --name-only | grep -Ev '^autodev/(STATE|PITFALLS|PLAN|SPEC)\.md$' >&2
  git reset -q; git checkout main; git branch -D "$BR"; exit 1
fi
git commit -m "$MSG"
git push -u origin "$BR"
gh pr create --title "$MSG" --body "autodev docs-only state update" --head "$BR" >/dev/null
gh pr merge "$BR" --squash --delete-branch
git checkout main && git pull --ff-only
