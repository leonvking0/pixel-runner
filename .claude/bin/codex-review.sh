#!/usr/bin/env bash
# codex-review.sh — Lane B of the adversarial review (KEEP-5 invocation, byte-for-byte flags).
# Usage: codex-review.sh <repo> <diff-file> <meta-file> <out.json>
# Exit: 0 = findings JSON valid at <out.json> · 1 = lane failed (caller logs and PROCEEDS — never blocks)
set -uo pipefail
REPO="${1:?usage: codex-review.sh <repo> <diff-file> <meta-file> <out.json>}"
DIFF="${2:?diff-file}"; META="${3:?meta-file}"; OUT="${4:?out.json}"
MODELS="$REPO/autodev/models.json"
CMODEL="$(jq -r '.roles.codex.model // empty' "$MODELS")"
CEFFORT="$(jq -r '.roles.codex.reasoning_effort // empty' "$MODELS")"
CTIER="$(jq -r '.roles.codex.service_tier // empty' "$MODELS")"
CTIMEOUT="$(jq -r '.roles.codex.timeout_sec // 300' "$MODELS")"
ARGS=()
[[ -n "$CMODEL"  ]] && ARGS+=(-c "model=\"$CMODEL\"")
[[ -n "$CEFFORT" ]] && ARGS+=(-c "model_reasoning_effort=\"$CEFFORT\"")
[[ -n "$CTIER"   ]] && ARGS+=(-c "service_tier=\"$CTIER\"")

STAGE="$(mktemp -d /tmp/autodev-codex-XXXXXX)"; trap 'rm -rf "$STAGE"' EXIT
cat "$REPO/.claude/codex-prompts/reviewer.md" > "$STAGE/prompt.md"
printf '\nDIFF_FILE: %s\nMETA_FILE: %s\n' "$DIFF" "$META" >> "$STAGE/prompt.md"

timeout "$CTIMEOUT" codex exec -s read-only -C "$REPO" --ignore-user-config \
  "${ARGS[@]}" \
  --output-schema "$REPO/.claude/schemas/codex-review.schema.json" \
  -o "$OUT" - < "$STAGE/prompt.md" 2>"$STAGE/stderr"
RC=$?
if [[ $RC -eq 124 ]]; then echo "codex lane: TIMEOUT (${CTIMEOUT}s)" >&2; exit 1; fi
if [[ $RC -ne 0 ]]; then echo "codex lane: exit $RC — $(tail -2 "$STAGE/stderr" | tr '\n' ' ')" >&2; exit 1; fi
jq -e '.findings and .verified_claims and .injection_attempts' "$OUT" >/dev/null 2>&1 \
  || { echo "codex lane: output failed schema shape check" >&2; exit 1; }
exit 0
