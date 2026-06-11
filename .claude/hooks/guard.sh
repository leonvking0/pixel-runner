#!/usr/bin/env bash
# autodev-lite guard — single PreToolUse hook for Bash AND Write|Edit (branches on tool_name).
# Enforces DESIGN.md §10. Blocks via exit 2 (stderr → model). The settings.json deny list is the
# belt; THIS file is load-bearing (D32). Build-review hardening (D36): protected git/gh commands are
# matched per-CLAUSE with global-flag tolerance and fail CLOSED — a hook that pattern-matches shell
# strings must over-block rather than miss a bypass (`git -C . push`, `gh -R x pr merge`, compound
# `&&` chains). Repo-state paths resolve to the git toplevel, not the event cwd.
set -uo pipefail
EVENT="$(cat)"
TOOL="$(jq -r '.tool_name // ""' <<<"$EVENT" 2>/dev/null)"
CWD="$(jq -r '.cwd // ""' <<<"$EVENT" 2>/dev/null)"
ROOT="$(git -C "$CWD" rev-parse --show-toplevel 2>/dev/null || echo "$CWD")"   # G8: never trust cwd
block(){ echo "BLOCKED by autodev guard: $1" >&2; exit 2; }
phase(){ cat "$ROOT/.autodev/phase" 2>/dev/null || echo ""; }

# ---------------------------------------------------------------- Write|Edit
if [[ "$TOOL" == "Write" || "$TOOL" == "Edit" || "$TOOL" == "MultiEdit" ]]; then
  FILE="$(jq -r '.tool_input.file_path // ""' <<<"$EVENT" 2>/dev/null)"
  [[ -z "$FILE" ]] && exit 0
  case "$FILE" in                                    # secret-shaped paths
    *.env|*.env.*|*.key|*.pem|*id_rsa*|*id_ed25519*|*id_ecdsa*|*secrets*|*credentials*|*.kdbx|*.gpg)
      block "refusing to write a secret-shaped path: $FILE" ;;
  esac
  case "$FILE" in                                    # rule 7: operator-only surfaces (incl. .claude/bin — G9)
    *.claude/settings.json|*.claude/settings.*.json|*.claude/hooks/*|*.claude/bin/*)
      block "rule 7: $FILE is operator-only (settings/hooks/bin are never agent-writable)." ;;
  esac
  if [[ "$(phase)" == "implement" ]]; then           # rule 8: implementers can't weaken the oracle
    case "$FILE" in *autodev/gate.sh)
      block "rule 8: autodev/gate.sh is not writable during implement — gate growth is the orchestrator's job at S3g." ;;
    esac
  fi
  exit 0
fi

[[ "$TOOL" == "Bash" ]] || exit 0
CMD="$(jq -r '.tool_input.command // ""' <<<"$EVENT" 2>/dev/null)"
[[ -z "$CMD" ]] && exit 0
# Verb-scrub (B2 finding F-1, D40): fd-duplications (2>&1, >&2) and >/dev/null are not file writes.
# Strip them before WRITE-VERB matching only — otherwise `bash .claude/bin/codex-review.sh … 2>&1 | tail`
# (the review skill's own documented invocation) and gate RUNS during implement (`bash autodev/gate.sh
# 2>&1`) false-block on the bare `>`. Real redirects to real paths (`> f`, `2> f`, `&>> f`) survive
# the scrub and still match. Path greps stay on the unscrubbed $CMD.
SCRUB="$(sed -E 's%[0-9]*>&[0-9]+%%g; s%[0-9]*>[[:space:]]*/dev/null%%g' <<<"$CMD")"

# ---- whole-command rules (token presence anywhere) ------------------------------------------
# rule 9: HALT is operator-only
if grep -Eq '(^|[^[:alnum:]_])(rm|mv|unlink)\b[^|;&]*\bHALT\b' <<<"$CMD" \
   || grep -Eq 'find\b[^|;&]*\bHALT\b[^|;&]*-delete' <<<"$CMD"; then
  block "rule 9: HALT is the operator's kill-switch — agents never remove or move it."
fi
# rule 7 (Bash side, G6): any write-capable reference to operator-only surfaces, fail-closed
if grep -Eq '\.claude/(settings[^[:space:]]*\.json|hooks|bin)' <<<"$CMD" \
   && grep -Eq '(sed[[:space:]]+-i|\bawk\b|\btee\b|>>|>|\bcp\b|\bmv\b|\bchmod\b|\btruncate\b|\bdd\b|\binstall\b|\brm\b|\bpython3?\b|\bperl\b|\bnode\b)' <<<"$SCRUB"; then
  block "rule 7: .claude/{settings*.json,hooks,bin} are operator-only — no shell writes (any verb)."
fi
# rule 8 (Bash side, G5): no gate.sh writes during implement
if [[ "$(phase)" == "implement" ]] && grep -Eq 'autodev/gate\.sh' <<<"$CMD" \
   && grep -Eq '(sed[[:space:]]+-i|\btee\b|>>|>|\bcp\b|\bmv\b|\bchmod\b|\btruncate\b|\bdd\b|\bpython3?\b|\bperl\b|\bnode\b)' <<<"$SCRUB"; then
  block "rule 8: autodev/gate.sh is not writable during implement (any shell verb) — gate growth is the orchestrator's at S3g."
fi
# rule 6 (G1+G7): secret-shaped PATH token (anchored, excludes scratch .env), broadened verbs + creds cmd
if grep -Eq 'gh[[:space:]]+auth[[:space:]]+token' <<<"$CMD"; then
  block "rule 6: 'gh auth token' prints a credential — refused."
fi
if grep -Eq '(^|[/"'"'"'[:space:]=])\.env\b|id_rsa|id_ed25519|id_ecdsa|\.pem|\.key\b|secrets|credentials|hosts\.yml|\.kdbx|\.gpg' <<<"$CMD" \
   && ! grep -Eq '\.autodev/[^[:space:]]*\.env' <<<"$CMD" \
   && grep -Eq '(\bcat\b|\bcp\b|\bmv\b|\btee\b|\bsed\b|\bawk\b|\bbase64\b|\bxxd\b|\bod\b|\bstrings\b|\bcurl\b|\bnc\b|>>|>|git[[:space:]]+(diff|show|log[[:space:]]+-p))' <<<"$SCRUB"; then
  block "rule 6: secret-shaped path in a read/copy/exfil command — refused."
fi
# rule 10: no repo-admin mutation
if grep -Eq 'gh[[:space:]]+api.*(branches/.*protection|rulesets|/rules)' <<<"$CMD" \
   && grep -Eq '(-X[[:space:]]*(POST|PUT|PATCH|DELETE)|--method)' <<<"$CMD"; then
  block "rule 10: mutating branch protection / rulesets is the operator's."
fi

# ---- per-CLAUSE rules: git/gh subcommand detection, global-flag-tolerant, fail-closed -------
# Split on && || ; | and newlines so a broadened `git\b…\bpush\b` match can't span into an unrelated
# clause (G11) and so each protected subcommand is judged on its own clause (G2/G4).
CLAUSES="$(sed -E 's/&&/\n/g; s/\|\|/\n/g; s/;/\n/g; s/\|/\n/g' <<<"$CMD")"
while IFS= read -r C; do
  [[ -z "${C//[[:space:]]/}" ]] && continue
  # does this clause invoke git / gh (possibly behind global flags)?
  GIT=0; GH=0
  grep -Eq '(^|[^[:alnum:]_])git\b' <<<"$C" && GIT=1
  grep -Eq '(^|[^[:alnum:]_])gh\b'  <<<"$C" && GH=1

  if [[ $GIT -eq 1 ]]; then
    # Anchor rules to the git SUBCOMMAND (first non-flag token after git, global-flags tolerated),
    # never a bare substring — `git stash push`, `git merge-base`, `git branch --merged`,
    # `git log --merges`, `git config rebase.x`, and `... $(date +%s)` must NOT trip push/merge/rebase
    # (D45, dogfood-found: the M1-recovery session had to dodge the `git stash push` false-positive,
    # and `git merge-base` — which oracle-integrity.sh uses — matched the old `\bmerge\b`). The
    # subcommand must be followed by whitespace or end-of-clause so `merge` ≠ `merge-base`.
    GF='([[:space:]]+-[^[:space:]]+([[:space:]]+[^[:space:]]+)?)*'
    isgit(){ grep -Eq "(^|[^[:alnum:]_])git${GF}[[:space:]]+$1([[:space:]]|\$)" <<<"$C"; }
    # rule 1: push to a protected base, any refspec form OR a bare push while HEAD is protected
    if isgit push; then
      if grep -Eq '(origin[[:space:]]+(main|master)\b|HEAD:(main|master)\b|:[[:space:]]*(main|master)\b)' <<<"$C"; then
        block "rule 1: push to a protected base. Work on autodev/* and open a PR."
      fi
      BR="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
      [[ "$BR" == "main" || "$BR" == "master" ]] \
        && block "rule 1: refusing to push while HEAD=$BR. Switch to an autodev/* branch."
      # rule 2: force / history-rewrite / push-delete (scoped to the push clause; a + refspec starts
      # with an alnum ref token, so `$(date +%s)` — '+%' — does not match)
      grep -Eq '(--force\b|[[:space:]]-f\b|--force-with-lease\b|[[:space:]]\+[A-Za-z0-9_][^[:space:]]*:|--delete\b|[[:space:]]-d\b|[[:space:]]:[A-Za-z0-9_/.-]+[[:space:]]*$)' <<<"$C" \
        && block "rule 2: force-push / push-delete is forbidden; branches are append-only."
    fi
    # rule 2: no rebase
    isgit rebase && block "rule 2: git rebase is forbidden — merge origin/main INTO the branch."
    # rule 3: git merge — only origin/main INTO an autodev/* branch, or --abort
    if isgit merge; then
      BR="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
      if [[ "$BR" == autodev/* ]] && grep -Eq '\bgit\b([[:space:]]+-[^[:space:]]+([[:space:]]+[^[:space:]]+)?)*[[:space:]]+merge([[:space:]]+(--no-ff|--no-edit|--no-commit|--ff-only|-q|--quiet))*[[:space:]]+origin/(main|master)[[:space:]]*$' <<<"$C"; then
        :
      elif [[ "$BR" == autodev/* ]] && grep -Eq '\bgit\b[^|;&]*merge[[:space:]]+--abort[[:space:]]*$' <<<"$C"; then
        :
      else
        block "rule 3: git merge is restricted — only 'git merge origin/main' (or --abort) INTO an autodev/* branch."
      fi
    fi
  fi

  # rule 4 fires ONLY on the `gh … pr merge` SUBCOMMAND (global flags tolerated), never on the word
  # "merge" appearing elsewhere — `gh pr create --title "… merge …"` / `gh pr comment` with "merge" in
  # the body must pass (D47, dogfood-found: the /autodev-revert session's first `gh pr create` echoed
  # PR #14's "bad merge" title and was wrongly blocked). Same subcommand-anchoring discipline as D45.
  if [[ $GH -eq 1 ]] && grep -Eq '(^|[^[:alnum:]_])gh([[:space:]]+-[^[:space:]]+([[:space:]]+[^[:space:]]+)?)*[[:space:]]+pr[[:space:]]+merge([[:space:]]|$)' <<<"$C"; then
    # rule 4 — fail-closed merge precondition
    grep -q -- '--admin'  <<<"$C" && block "rule 4: --admin merges are forbidden."
    grep -q -- '--squash' <<<"$C" || block "rule 4: merges must be --squash."
    [[ -f "$ROOT/HALT" ]] && block "rule 4: HALT present — no merge while the kill-switch is set."
    [[ "$(phase)" == "implement" ]] && block "rule 4: no merge during the implement phase."
    # the strict parseable form: `gh pr merge <ref> ...` with no global flags before pr. Anything else → fail closed.
    grep -Eq '\bgh[[:space:]]+pr[[:space:]]+merge[[:space:]]+[^-][^[:space:]]*' <<<"$C" \
      || block "rule 4: unparseable 'gh pr merge' shape (global flags or missing PR ref). Use 'gh pr merge <pr> --squash' with no flags before 'pr'."
    REF="$(grep -oE '\bgh[[:space:]]+pr[[:space:]]+merge[[:space:]]+[^-][^[:space:]]*' <<<"$C" | head -1 | awk '{print $4}')"
    PRJSON="$(cd "$ROOT" && gh pr view "$REF" --json headRefName,headRefOid 2>/dev/null)" \
      || block "rule 4: cannot resolve PR '$REF' (gh pr view failed) — fail-closed."
    HEADREF="$(jq -r '.headRefName' <<<"$PRJSON")"; HEADOID="$(jq -r '.headRefOid' <<<"$PRJSON")"
    [[ -z "$HEADREF" || -z "$HEADOID" || "$HEADOID" == null ]] && block "rule 4: PR head unresolved — fail-closed."
    DOCS_ONLY_RE='^autodev/(STATE|PITFALLS|PLAN|SPEC)\.md$'
    if [[ "$HEADREF" == autodev/state-* ]]; then
      DIFF="$(cd "$ROOT" && gh pr diff "$REF" --name-only 2>/dev/null)" \
        || block "rule 4: cannot read state-PR diff (gh failed) — fail-closed (G3)."   # G3: no || true
      NONDOC="$(grep -Ev "$DOCS_ONLY_RE" <<<"$DIFF" || true)"
      [[ -n "$NONDOC" ]] && block "rule 4: state-PR has non-docs files: $(head -3 <<<"$NONDOC" | tr '\n' ' ')"
    else
      MARKER="$(cat "$ROOT/.autodev/gate-green" 2>/dev/null || true)"
      [[ "$MARKER" == "$HEADOID" ]] || block "rule 4: gate marker ($MARKER) != PR head ($HEADOID) — re-run gate.sh as the LAST step before merge, then push."
      [[ -n "$(find "$ROOT/.autodev/gate-green" -mmin +60 2>/dev/null)" ]] && block "rule 4: gate marker older than 60 min — re-run gate.sh."
      RC_SHA="$(cat "$ROOT/.autodev/review-clean" 2>/dev/null || true)"
      [[ -n "$RC_SHA" ]] || block "rule 4: no .autodev/review-clean — adversarial review must pass before merge (D27)."
      git -C "$ROOT" merge-base --is-ancestor "$RC_SHA" "$HEADOID" 2>/dev/null \
        || block "rule 4: review-clean sha is not an ancestor of the PR head — re-review."
      NONDOC="$(git -C "$ROOT" diff --name-only "$RC_SHA..$HEADOID" 2>/dev/null | grep -Ev "$DOCS_ONLY_RE" || true)"
      [[ -n "$NONDOC" ]] && block "rule 4: non-docs changes after review-clean: $(head -3 <<<"$NONDOC" | tr '\n' ' ')"
    fi
  fi
done <<< "$CLAUSES"

# rule 5: repair-is-RED — Qwen primitives only during implement
if grep -Eq '(^|[^[:alnum:]_])(hybrid_gen|call_llm)\.py([^[:alnum:]_]|$)' <<<"$CMD" \
   || grep -Eq '(^|[[:space:]])-m[[:space:]]+(hybrid_gen|call_llm)([^[:alnum:]_]|$)' <<<"$CMD"; then
  [[ "$(phase)" == "implement" ]] \
    || block "rule 5: repair/review is RED — the weak model runs only during implement. Apply the fix as a direct Edit."
fi
exit 0
