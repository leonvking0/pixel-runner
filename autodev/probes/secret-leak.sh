#!/usr/bin/env bash
# secret-leak.sh — ALWAYS-ON must-zero probe (doc 05 §3). NON-LLM.
#
# Scans the PR diff (added lines vs --base) for high-confidence secret patterns.
# Uses `gitleaks` when available (authoritative); falls back to a redacted grep so
# the probe is never silently absent. A hit fails the gate regardless of pass-rate.
#
# Usage: secret-leak.sh --repo <dir> --base <ref> [--root <subdir>] [--scan-file <path>]
# Exit:  0 = clean; 2 = secret detected (output is REDACTED — never echoes the value).
set -uo pipefail

REPO="." ; BASE="origin/main" ; ROOT="." ; SCAN_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2;;
    --base) BASE="$2"; shift 2;;
    --root) ROOT="$2"; shift 2;;
    --scan-file) SCAN_FILE="$2"; shift 2;;
    *) shift;;
  esac
done
cd "$REPO" 2>/dev/null || { echo "secret-leak: bad --repo $REPO" >&2; exit 2; }

# Resolve the set of added lines to scan.
added_lines() {
  if git rev-parse --verify --quiet "$BASE" >/dev/null 2>&1; then
    git diff "$BASE"...HEAD -- "$ROOT" 2>/dev/null | grep -E '^\+' | grep -vE '^\+\+\+'
  else
    # no base ref (fresh / shallow / detached checkout): scan all tracked files. CRITICAL: if the
    # file(1) binary is unavailable, do NOT drop every file (that silently skips all secrets) —
    # scan them all (grep -a is binary-safe, so over-scanning is harmless).
    HAVE_FILE=0; command -v file >/dev/null 2>&1 && HAVE_FILE=1
    git ls-files -- "$ROOT" 2>/dev/null | while IFS= read -r f; do
      [ -f "$f" ] || continue
      if [ "$HAVE_FILE" -eq 1 ]; then
        file "$f" 2>/dev/null | grep -qiE 'text|json|xml|empty|ASCII|Unicode|private key|public key|certificate|PEM|OpenSSH|PGP' || continue
      fi
      sed 's/^/+/' "$f"
    done
  fi
}

# Authoritative path: gitleaks over the diff range.
if command -v gitleaks >/dev/null 2>&1; then
  if git rev-parse --verify --quiet "$BASE" >/dev/null 2>&1; then
    if gitleaks detect --no-banner --redact --log-opts "$BASE..HEAD" >/tmp/gl.$$ 2>&1; then
      :
    else
      echo "secret-leak: gitleaks flagged a secret in $BASE..HEAD (REDACTED):" >&2
      grep -iE -- 'secret|rule|finding|leak' /tmp/gl.$$ | head -20 >&2
      rm -f /tmp/gl.$$
      exit 2
    fi
    rm -f /tmp/gl.$$
  fi
fi

# Fallback / supplementary: high-confidence pattern grep (redacted reporting).
PATTERNS=(
  'AKIA[0-9A-Z]{16}'                                 # AWS access key id
  'gh[pousr]_[A-Za-z0-9]{30,}'                        # GitHub PAT / app / oauth / refresh
  'AIza[0-9A-Za-z_\-]{35}'                            # Google API key
  'xox[baprs]-[0-9A-Za-z-]{10,}'                      # Slack token
  'sk-[A-Za-z0-9]{20,}'                               # OpenAI-style key
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'               # private key block
  'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' # JWT
)
HITS=0
SCAN="$(added_lines)"
[ -n "$SCAN_FILE" ] && [ -f "$SCAN_FILE" ] && SCAN="$SCAN
$(sed 's/^/+/' "$SCAN_FILE")"

for pat in "${PATTERNS[@]}"; do
  # `--` terminates option parsing so a pattern beginning with '-' (e.g. the private-key
  # header '-----BEGIN ...') is treated as a pattern, not as grep flags. rc>=2 = real grep
  # error => fail-closed (never let a broken scan read as "clean").
  n=$(printf '%s\n' "$SCAN" | grep -aEc -- "$pat"); rc=$?
  if [ "$rc" -ge 2 ]; then echo "secret-leak: grep ERROR scanning a pattern (rc=$rc) — fail-closed" >&2; exit 2; fi
  if [ "${n:-0}" -gt 0 ]; then
    echo "secret-leak: $n match(es) for a high-confidence secret class (value REDACTED)" >&2
    HITS=$((HITS + n))
  fi
done

if [ "$HITS" -gt 0 ]; then
  echo "secret-leak: $HITS high-confidence secret hit(s) in the diff — gate BLOCKED" >&2
  exit 2
fi
echo "secret-leak: clean" >&2
exit 0
