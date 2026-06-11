#!/usr/bin/env bash
# autodev/gate.sh — PLACEHOLDER. Fails closed: nothing can merge before M0 lands a real oracle.
# M0 replaces this with the project's deterministic gate (see CLAUDE.md doctrine):
#   exit 0 = pass · last line on fail = "GATE FAIL step=<name>" · on pass write
#   `git rev-parse HEAD > .autodev/gate-green` (unless .autodev/phase == implement)
#   · step=secrets (secret-leak.sh) · step=integrity (oracle-integrity.sh — freezes the
#     acceptance tests against implement-phase weakening, D43) · ≥1 real test step
#   · ≥1 runtime-launch step · ≤10 min · no network beyond localhost.
echo "GATE FAIL step=placeholder — no oracle yet: milestone 0 must create the real gate.sh"
exit 1
