---
name: autodev-plan
description: The PM skill — author or revise autodev/SPEC.md + PLAN.md. Modes: new (interview the operator, greenfield), adopt (existing repo — detect toolchain, write the gate from commands that verifiably pass), replan (the ONLY legal way to change SPEC mid-project). Run interactively.
---

# /autodev-plan [new|adopt|replan]

You are the product manager. Output: `autodev/SPEC.md`, `autodev/PLAN.md`, `autodev/STATE.md` seed. Default mode: `new` if SPEC.md is the template seed, else `replan`.

## Mode: new
1. Interview the operator — at most 6 questions: product in one paragraph; must-have acceptance criteria; non-goals; stack constraints; what "done" means for the whole project; what a runtime smoke means for THIS app (URL? CLI invocation?). Stop asking once every AC is machine-checkable in principle.
2. Write `SPEC.md`: `## Product`, `## Acceptance criteria` (AC-1…AC-n, each testable), `## Non-goals`, `## Decisions` (append-only), `## Revision log`.
3. Write `PLAN.md` milestones (format: `- [ ] M<n> — <title>` + indented `goal:` / `accept:` runnable commands / `landmines:` MUST/MUST-NOT facts for the weak model).
4. Seed `STATE.md` (status ready, milestone M0, attempts 0).
5. Commit: day-0 pre-protection → directly on main; protected repo → `bash .claude/bin/state-pr.sh "plan: <summary>"`.

## Mode: adopt
1. Spawn ONE survey subagent (Explore): "map stack, test/build/lint commands, entry points; return ≤40 lines."
2. EXECUTE each candidate gate command once on the clean tree — only commands that verifiably pass (or verifiably fail) go into `autodev/gate.sh`. Baseline red → M0 = "make the gate green on main"; nothing merges before a green baseline.
3. Interview for SPEC (seeded from README; one extra question: "is the existing suite green and trusted?"). Then as `new` steps 3–5.

## Mode: replan
Interactive only. Revise SPEC (bump revision, append `## Decisions`), restructure FUTURE milestones, triage Backlog. Never touch `[x]` history. This is the only path that changes SPEC — orchestrator sessions BLOCK on spec-drift and send the operator here. **Commit the SPEC + PLAN + STATE edits together** via `bash .claude/bin/state-pr.sh "replan: <summary>"` (it stages SPEC.md too) — leaving SPEC dirty would be stashed away by the next session's S0, reviving the spec-drift block.

## Milestone sizing rules (apply in every mode)
- **M0 is always the oracle**: real `autodev/gate.sh` (exit-code verdict, `GATE FAIL step=<name>` on fail, writes `.autodev/gate-green` on pass unless phase==implement, ≥1 real test, ≥1 runtime-launch step, a `step=secrets` running `bash autodev/probes/secret-leak.sh`, a `step=integrity` running `bash autodev/probes/oracle-integrity.sh` as the FIRST step after `secrets` — it freezes the acceptance tests so the implement phase can't weaken them (D43), ≤10 min, localhost-only) — and M0's `accept:` includes the **inversion proof**: temporarily invert the smoke assertion and verify gate.sh exits non-zero.
- One milestone = one PR = one fresh session: ≤6 files, ≤600 changed lines, 0.5–2h of agent work (the driver watchdog is 3h — stay under it).
- Every milestone ends gate-green and runnable; **every milestone must extend the gate** (new committed acceptance test or smoke step) — no oracle growth, no milestone.
- **UI milestones gate the WIRING, not just existence (D47).** Any gate/smoke step that asserts a control `id="X"` exists in the served HTML MUST also assert linkage: extract every id the controller wires (`getElementById('X')` / `querySelector('#X')` in the UI JS) and assert each is present as an `id="X"` in the HTML (JS-referenced ids ⊆ HTML ids). Existence-only checks pass green on a from-scratch id mismatch (`id="newgame"` vs `getElementById('new-game')`) or a lockstep rename, merging a silently-dead control. A pure grep/set-subset step is deterministic and needs no browser (the zero-dep/≤10-min gate budget holds).
- Dependencies are expressed by ordering only. If autodev-hybrid-dev's planner would emit >6 subtasks, the milestone is too big — split it.

## Hard RED rules (bake into every milestone's landmines)
Diagnosis/repair is RED (strong model, direct diffs). No runtime oracle ⇒ RED. Editing existing files ⇒ RED. Default-deny to RED — the weak model only ever generates NEW self-contained files from sparse goal-level instructions with exact constants and MUST/MUST-NOT landmines.
