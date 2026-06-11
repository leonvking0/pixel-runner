---
name: autodev-revert
description: One-command bad-merge recovery — revert a squash-merged autodev PR through the normal gated pipeline (revert branch → gate → PR → lane-A review → merge), append the lesson, reopen the milestone if needed. Usage: /autodev-revert <pr-number>. Incident-safe headless: claude -p --dangerously-skip-permissions "/autodev-revert <n>" (hooks still gate the merge).
---

# /autodev-revert <pr>

1. `gh pr view <pr> --json mergeCommit,title` → the squash sha (single-parent; plain `git revert` works).
2. `git checkout main && git pull --ff-only` ; `git checkout -b autodev/revert-<pr>` ; `git revert --no-edit <sha>`.
3. `bash autodev/gate.sh` — red → fix forward surgically (one round) or stop and report; never merge a red revert.
4. Append the PITFALLS lesson (what merged badly, why review+gate missed it) and, if the feature must be redone, reopen it in PLAN.md as a new `- [ ]` milestone with the lesson as a landmine. Commit (these docs edits may ride this branch — the revert PR's diff is not docs-only, so it takes the NORMAL merge path, not the state-* exemption).
5. Push → `gh pr create --title "revert: PR #<pr> — <title>"` → run `/autodev-review` (lane A only is acceptable here) → **`git push`** (review patches are committed locally — without this the server PR head is stale and guard rule 4 blocks the merge) → re-run `bash autodev/gate.sh` (marker at final HEAD) → `gh pr merge --squash --delete-branch`.
6. Report: reverted sha, new PR number, lesson appended, milestone reopened or not.
