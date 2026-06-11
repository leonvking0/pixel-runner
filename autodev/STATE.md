# STATE — machine-maintained cache. If git/gh disagree with this file, git/gh win.
status: ready                # ready | BLOCKED
milestone: M0
attempts: 0                  # attempts at THIS milestone; 3 ⇒ BLOCKED
last_failure: none           # canonical signature "GATE FAIL step=<name>", or none
blocked_reason: none
last_session: (none)
last_gate: (never run)
updated: 2026-06-10 (plan v2 committed — pre-launch tightening, SPEC v2 D8–D11)

## Notes (this milestone only; wiped at close-out)
- M0 replaces the placeholder autodev/gate.sh — until then the gate fails closed by design.
- gate.sh is ORCHESTRATOR-authored at S3g (RED, SPEC D9) — NOT in the hybrid-dev file list.
