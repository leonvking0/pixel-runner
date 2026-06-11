#!/usr/bin/env bash
# autodev/gate.sh — deterministic merge gate (SPEC D5). ORCHESTRATOR-authored only (SPEC D9).
# Steps in order: secrets → integrity → hygiene → unit → smoke-fall.
# Fail ⇒ last line is exactly "GATE FAIL step=<name>" + non-zero exit.
# Pass ⇒ write `git rev-parse HEAD` to .autodev/gate-green UNLESS .autodev/phase == implement.
# Constraints: ≤10 min, localhost-only, zero dependencies (node + git + bash only).
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "GATE FAIL step=setup"; exit 1; }
cd "$ROOT" || { echo "GATE FAIL step=setup"; exit 1; }

fail() { echo "GATE FAIL step=$1"; exit 1; }

# --- step=secrets ---------------------------------------------------------
bash autodev/probes/secret-leak.sh --repo . --base origin/main || fail secrets

# --- step=integrity (FIRST after secrets — SPEC D5/D43) -------------------
bash autodev/probes/oracle-integrity.sh || fail integrity

# --- step=hygiene (AC-6 media ban + AC-7 zero-dep + determinism greps) ----
# Scans fail CLOSED: rc=0 (match found) and rc>=2 (scanner error) both fail; only rc=1 passes.
TRACKED="$(git ls-files)" || fail hygiene
# Media ban: any tracked binary/media asset fails (case-insensitive).
printf '%s\n' "$TRACKED" | grep -iE '\.(png|jpg|jpeg|gif|webp|bmp|ico|svg|wav|mp3|ogg|flac|mid|ttf|otf|woff|woff2)$'
[[ $? -ne 1 ]] && fail hygiene
# Zero-dep: no package.json or node_modules anywhere in the tree.
printf '%s\n' "$TRACKED" | grep -E '(^|/)package\.json$|(^|/)node_modules/'
[[ $? -ne 1 ]] && fail hygiene
# Determinism: no wall-clock/random in deterministic dirs. git grep pathspecs
# tolerate not-yet-existing dirs (exit 1 = no matches = pass).
git grep -nE 'Date\.now|Math\.random|performance\.now' -- src/core src/characters src/levels
[[ $? -ne 1 ]] && fail hygiene

# --- step=unit ------------------------------------------------------------
node --test test/ || fail unit

# --- step=smoke-fall ------------------------------------------------------
node autodev/smoke/fall.smoke.mjs || fail smoke-fall

# --- pass (stamp BEFORE verdict: a failed stamp must never read as green) --
if [[ "$(cat .autodev/phase 2>/dev/null)" != "implement" ]]; then
  { mkdir -p .autodev && git rev-parse HEAD > .autodev/gate-green; } || fail stamp
fi
echo "GATE PASS"
exit 0
