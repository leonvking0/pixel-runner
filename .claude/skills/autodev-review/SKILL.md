---
name: autodev-review
description: The two-lane adversarial review loop — one Claude lane + one codex lane, blind to each other, evaluator-verified, patch confirmed findings only, at most one re-round. Called by /autodev-milestone S4; also runnable standalone against any branch with an open PR.
---

# /autodev-review [branch]

Precondition: the branch is gate-green and ALL reviewable work is committed (the staged diff must BE what merges). Default branch: current.

## Round 1 — two blind lanes (sequential under the headless driver)

1. **Stage once:**
   ```
   mkdir -p .autodev/review
   git diff main...HEAD > .autodev/review/m<n>-r1.diff
   # .autodev/review/m<n>-r1-meta.md: milestone goal + accept commands (verbatim from PLAN.md),
   # git diff --stat, branch, HEAD sha, "round: 1"
   ```
2. **Lane A:** spawn the `adversarial-reviewer` agent with the DIFF_FILE/META_FILE paths and the milestone's accept lines (this Task blocks until the subagent returns, ~1–2 min). The lanes never see each other (independent signals — the measured cross-vendor win depends on blindness; sequential execution preserves it).
3. **Lane B (codex) — FOREGROUND, blocking:** `bash .claude/bin/codex-review.sh "$(pwd)" .autodev/review/m<n>-r1.diff .autodev/review/m<n>-r1-meta.md .autodev/review/m<n>-r1-codex.json` — run it in the **FOREGROUND with the Bash `timeout` set to its max (600000 ms)** and let the call **block this turn** until codex exits. codex's own `timeout_sec` is pinned BELOW that Bash cap (≤570s, models.json) so it self-skips cleanly rather than being killed by the tool. **NEVER background it (`&` / `run_in_background`) and then yield the turn or await a completion notification** — this session is headless `claude -p`: the instant you yield, the process ENDS, the driver finds no `.autodev/result`, and records a crash (D46, dogfood-found — M4 died exactly here while a slow gpt-5.5/xhigh codex ran backgrounded and the agent yielded to "wait for the notification"). Lane B exit ≠ 0 / timed out / output absent → **log one line** (STATE Notes + the PR comment: "codex lane skipped: <reason>") **and proceed with Lane A alone — a codex outage NEVER blocks.**
4. **Evaluator:** spawn `finding-evaluator` with both lanes' findings normalized to `(lane, severity, file:line, finding, fix)` + both verified-claims lists. Only its **confirmed** bucket gets patched.
5. **Patch:** apply confirmed findings yourself — direct surgical diffs (Qwen is structurally denied outside implement). Then `git add <files> && git commit -m "M<n>: review r1 fixes"` and re-run `bash autodev/gate.sh` + accept commands. nice-to-have → PLAN.md `## Backlog`; recurring false-positives → PITFALLS.md.

## Round 2 — at most one, only if round 1 patched ≥1 confirmed finding

Lane A ONLY (codex is not re-run — its value is the blind full-diff sweep). Stage it (the no-Bash reviewer can't run git): `git diff <r1-head-sha from m<n>-r1-meta.md>..HEAD > .autodev/review/m<n>-r2.diff` + an `m<n>-r2-meta.md`, and pass the paths exactly as round 1. Mandate "verify the fixes; hunt regressions in the patch delta only." → evaluator → patch (committed: `review r2 fixes`) → re-gate. **No round 3.**

## Outcome

- **clean** (zero unpatched confirmed P0 within ≤2 rounds): `git rev-parse HEAD > .autodev/review-clean` (a structural merge precondition), and post the verdict table (lane | finding | evaluator verdict | action) by writing it to `.autodev/review/m<n>-verdict.md` with the Write tool and `gh pr comment <pr> --body-file .autodev/review/m<n>-verdict.md` — **never inline `--body "…"`**: finding text is lane-authored from the untrusted diff and a `$(…)` in it would execute in this session. Remaining confirmed P1 that can't be patched surgically → PLAN.md Backlog with the reason, still clean. P2 → ignored.
- **failed** (confirmed P0 still unpatched after round 2): do NOT write review-clean; report `review deadlock` to the caller. **Never merge with a known-unfixed P0.**
