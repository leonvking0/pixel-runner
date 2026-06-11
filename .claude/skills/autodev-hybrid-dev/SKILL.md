---
name: autodev-hybrid-dev
description: Project-local copy of the hybrid auto-dev inner loop — the strong model plans/reviews/fixes, the local weak model (per autodev/models.json roles.weak) generates new files, a deterministic gate decides done. Invoked by /autodev-milestone S2 with an explicit branch + task packet; also usable standalone for a one-off task in this repo. Named `autodev-hybrid-dev` (NOT `hybrid-dev`) so the Skill resolver can never bind a user-level `hybrid-dev` skill of the same name (D44).
---

# autodev-hybrid-dev (project-local)

Pinned to THIS repo — workflow and model config travel with the project (autodev-lite D15):
- workflow: `<repo>/.claude/workflows/hybrid-dev.js`
- models: `<repo>/autodev/models.json` (weak role; `lib/gen` is its sibling — never separate them)

## Invocation

1. Parse args: **task** (required — the instruction packet), **branch** (recommended: `autodev/m<n>-<slug>`; hybrid-dev CREATES it — callers must not pre-create), **mode** `auto|greenfield|brownfield` (default auto), **max_fix_rounds** (default 3), **commit** (default true when called by /autodev-milestone, else false = staged for inspection).
2. Preflight the rig: read `base_url`/`model` from `autodev/models.json` roles.weak; `curl -s --max-time 5 <base_url>/models` must list the model — else report "vLLM rig down" to the caller and STOP.
3. Launch:
   ```
   Workflow({
     scriptPath: '<repo>/.claude/workflows/hybrid-dev.js',
     args: { repo: '<abs repo>', task: '<task>', branch: '<branch>',
             models: '<abs repo>/autodev/models.json',
             mode: '<mode>', max_fix_rounds: <n>, commit: <bool> }
   })
   ```
4. On completion return the summary faithfully: status (one of `done` / `gate-pass-review-open` / `incomplete` — report the exact value, never soften or rename), gate pass/fail tails, must-fix findings with file:line, diff --stat, branch name, Qwen-vs-strong token ledger. The caller (orchestrator) judges; you don't re-do work.
