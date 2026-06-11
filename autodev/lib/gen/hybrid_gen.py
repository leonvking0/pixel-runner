#!/usr/bin/env python3
"""Hybrid auto-dev: generate ONE file with the local weak model (Qwen via vLLM).

This is the weak-model heavy-lifting primitive for the hybrid-dev workflow. It
reuses call_llm's HTTP call + fenced-block extraction + env-driven sampling
profile, writes the generated code to an ARBITRARY target path (creating parent
dirs), and prints a one-line JSON result including token usage so the workflow
can keep an accurate cost ledger.

Strong-model planning/review/fix never goes through here — only initial
generation of new, self-contained files (the GREEN regime).

Usage:
  set -a && source config.env && set +a   # load LLM_* for the local rig
  python3 scripts/hybrid_gen.py --target /abs/repo/src/foo.py --instruction prompt.txt

Output (stdout, single JSON line):
  {"ok": true, "target": "...", "bytes": N, "prompt_tokens": N,
   "completion_tokens": N, "duration_sec": F, "finish_reason": "stop"}
  or {"ok": false, "error": "..."}
"""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from call_llm import call, extract_artifact, _env_num  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True, help="absolute path of the file to write")
    ap.add_argument("--instruction", required=True, help="file containing the Qwen prompt")
    ap.add_argument("--base-url",
                    default=os.environ.get("LLM_BASE_URL", "http://localhost:8000/v1"))
    ap.add_argument("--model", default=os.environ.get("LLM_MODEL", "qwen"))
    ap.add_argument("--max-tokens", type=int,
                    default=int(os.environ.get("LLM_MAX_TOKENS", "81920")))
    ap.add_argument("--temperature", type=float,
                    default=float(os.environ.get("LLM_TEMPERATURE", "0.6")))
    ap.add_argument("--timeout", type=int,
                    default=int(os.environ.get("LLM_TIMEOUT", "1800")))
    args = ap.parse_args()

    enable_thinking = os.environ.get("LLM_ENABLE_THINKING", "true").lower() \
        in ("1", "true", "yes", "on")
    sampling = {
        "top_p": _env_num("LLM_TOP_P", float),
        "top_k": _env_num("LLM_TOP_K", int),
        "presence_penalty": _env_num("LLM_PRESENCE_PENALTY", float),
        "min_p": _env_num("LLM_MIN_P", float),
    }

    instruction = Path(args.instruction).read_text(encoding="utf-8")
    target = Path(args.target)
    ext = target.suffix.lstrip(".") or "txt"
    prompt = (
        instruction
        + f"\n\nOutput ONLY the complete contents of the file `{target.name}` "
          f"as a single ```{ext} fenced code block. No prose before or after "
          f"the block. Emit the entire file, ready to write to disk."
    )

    try:
        raw, dur = call(args.base_url, args.model, prompt, args.max_tokens,
                        enable_thinking, args.temperature, args.timeout, sampling)
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        return 1

    msg = raw["choices"][0]["message"]
    content = msg.get("content") or ""
    usage = raw.get("usage", {})
    finish = raw["choices"][0].get("finish_reason")

    art = extract_artifact(content, target.name)
    if not art:
        print(json.dumps({
            "ok": False, "error": "no code block extracted from model output",
            "completion_tokens": usage.get("completion_tokens"),
            "finish_reason": finish,
        }))
        return 1

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(art + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "target": str(target),
        "bytes": len(art.encode("utf-8")),
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        "duration_sec": round(dur, 1),
        "finish_reason": finish,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
