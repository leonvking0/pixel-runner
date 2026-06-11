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
# Media ban: any tracked binary/media asset fails.
if git ls-files | grep -E '\.(png|jpg|jpeg|gif|webp|bmp|ico|svg|wav|mp3|ogg|flac|mid|ttf|otf|woff|woff2)$'; then
  fail hygiene
fi
# Zero-dep: no package.json or node_modules anywhere in the tree.
if git ls-files | grep -E '(^|/)package\.json$|(^|/)node_modules/'; then
  fail hygiene
fi
# Determinism: no wall-clock/random in deterministic dirs. git grep pathspecs
# tolerate not-yet-existing dirs (exit 1 = no matches = pass).
if git grep -nE 'Date\.now|Math\.random|performance\.now' -- src/core src/characters src/levels; then
  fail hygiene
fi

# --- step=unit ------------------------------------------------------------
node --test test/ || fail unit

# --- step=smoke-fall ------------------------------------------------------
node autodev/smoke/fall.smoke.mjs || fail smoke-fall

# --- pass -----------------------------------------------------------------
echo "GATE PASS"
if [[ "$(cat .autodev/phase 2>/dev/null)" != "implement" ]]; then
  git rev-parse HEAD > .autodev/gate-green
fi
exit 0
