

## autodev doctrine
- Truth hierarchy (highest wins): merged PRs on GitHub → git → PLAN.md checkboxes → STATE.md (a cache; rewrite it, never believe it).
- Cold start: read autodev/STATE.md → autodev/PLAN.md. Then PITFALLS.md head, then only the SPEC AC-ids the milestone cites.
- Normalize before you read: reset .autodev/phase, fetch, stash dirt, checkout fresh main — THEN read state.
- Branch per milestone: autodev/m<n>-<slug>. Append-only; merge origin/main INTO the branch; never rebase; never push to main.
- The gate is autodev/gate.sh + the milestone's accept: commands. Exit code is the verdict. No LLM judgment of done-ness, ever.
- A commit after a gate run stales the marker — re-run gate.sh as the LAST step before merge. Every fix/patch round is committed before any gate run or review staging.
- GREEN/RED: new self-contained files → weak model (hybrid-dev, implement phase only). Edits, integration, diagnosis, repair → strong model DIRECT surgical diffs. Never re-emit a whole file to change a few lines.
- Review findings are hypotheses (30–70% false-positive measured). Verify before patching; patch only evaluator-confirmed findings.
- Merge: gh pr merge --squash after gate-green + review-clean (both structural). Bad merge → /autodev-revert.
- Failure: the branch is the checkpoint. Book the lesson (state-pr.sh) BEFORE teardown; re-run the milestone from scratch.
- SPEC is frozen mid-run. Contradiction ⇒ BLOCKED: spec-drift; the operator reruns /autodev-plan.
- Kill-switch: HALT file at repo root (operator-only). attempts ≥ 3 ⇒ BLOCKED.
- Sessions end by writing .autodev/result with exactly one line: DONE … | RETRY … | BLOCKED: … | PLAN-COMPLETE.
