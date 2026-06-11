#!/usr/bin/env python3
"""Resolve a model ROLE from models.json into the LLM_* environment the bundled
generation primitives (hybrid_gen.py / call_llm.py) already read.

This is the C3 decoupling bridge: it replaces sourcing llm-code-bench/config.env.
The primitives stay BYTE-IDENTICAL — this script just prints the same `export
LLM_*=...` lines that config.env used to, but resolved from models.json (+ an
optional per-machine models.local.json override that deep-merges on top).

Usage (the relocated hybrid-dev.js injects this into the GREEN gen prompt):
    set -a && eval "$(python3 resolve_model.py --role weak --config /abs/.claude/models.json)" && set +a
    python3 hybrid_gen.py --target /abs/repo/src/foo.py --instruction prompt.txt

Secrets contract (doc 02 / DESIGN §4 decision 13): models.json stores only the
NAME of an api-key env var (`api_key_env`), never a secret value. LLM_API_KEY is
read from that named env var in the LIVE environment at resolve time; if the role
declares an api_key_env and it is unset, this fails closed (the local Qwen role
declares none and needs none). The key VALUE is never echoed back except as the
LLM_API_KEY export the caller `eval`s — never logged.

Output: shell-quoted `export LLM_...=...` lines to stdout. Only resolved
(non-null) values are emitted, so the primitive's own defaults apply to anything
omitted — matching config.env's "only set vars are exported" behavior.
"""
import argparse
import json
import os
import shlex
import sys
from pathlib import Path

# role.<dotted path>  ->  LLM_* env var the primitives read (call_llm.py / hybrid_gen.py)
FIELD_MAP = [
    ("base_url",                  "LLM_BASE_URL"),
    ("model",                     "LLM_MODEL"),
    ("sampling.max_tokens",       "LLM_MAX_TOKENS"),
    ("sampling.temperature",      "LLM_TEMPERATURE"),
    ("sampling.top_p",            "LLM_TOP_P"),
    ("sampling.top_k",            "LLM_TOP_K"),
    ("sampling.presence_penalty", "LLM_PRESENCE_PENALTY"),
    ("sampling.min_p",            "LLM_MIN_P"),
    ("sampling.enable_thinking",  "LLM_ENABLE_THINKING"),
    ("timeout_sec",               "LLM_TIMEOUT"),
    ("concurrency",               "LLM_CONCURRENCY"),
]


def _deep_merge(base: dict, override: dict) -> dict:
    """Recursively merge override onto base (override wins). Returns a new dict."""
    out = dict(base)
    for k, v in override.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def _dig(obj: dict, dotted: str):
    cur = obj
    for part in dotted.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def _fmt(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--role", required=True,
                    help="role key under models.json roles{} (e.g. weak, weak_fallback)")
    ap.add_argument("--config", required=True,
                    help="absolute path to models.json")
    args = ap.parse_args()

    config_path = Path(args.config)
    if not config_path.is_file():
        print(f"resolve_model: config not found: {config_path}", file=sys.stderr)
        return 1
    try:
        models = json.loads(config_path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"resolve_model: invalid JSON in {config_path}: {e}", file=sys.stderr)
        return 1

    # Per-machine override: models.local.json sibling deep-merges on top.
    local_path = config_path.with_name("models.local.json")
    if local_path.is_file():
        try:
            local = json.loads(local_path.read_text(encoding="utf-8"))
            models = _deep_merge(models, local)
        except Exception as e:  # noqa: BLE001
            print(f"resolve_model: invalid JSON in {local_path}: {e}", file=sys.stderr)
            return 1

    roles = models.get("roles", {})
    if args.role not in roles:
        print(f"resolve_model: role '{args.role}' not in roles: "
              f"{sorted(roles)}", file=sys.stderr)
        return 1
    role = roles[args.role]

    lines = []
    for dotted, env in FIELD_MAP:
        val = _dig(role, dotted)
        if val is not None:  # 0 / false are valid and emitted
            lines.append(f"export {env}={shlex.quote(_fmt(val))}")

    # Secret: resolve the named env var's VALUE from the live env (fail closed).
    api_key_env = role.get("api_key_env")
    if api_key_env:
        secret = os.environ.get(api_key_env)
        if not secret:
            print(f"resolve_model: role '{args.role}' requires env var "
                  f"'{api_key_env}' but it is unset/empty", file=sys.stderr)
            return 1
        lines.append(f"export LLM_API_KEY={shlex.quote(secret)}")

    if not lines:
        print(f"resolve_model: role '{args.role}' resolved to no fields",
              file=sys.stderr)
        return 1

    sys.stdout.write("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
