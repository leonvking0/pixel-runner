#!/usr/bin/env python3
"""Single-shot LLM call for the benchmark.

Reads a prompt file, POSTs it to an OpenAI-compatible endpoint, and saves:
- response.json (raw)
- thinking.md (the 'reasoning' field, if present)
- <artifact>.html (extracted from ```fenced block)
- meta.json (timing, tokens, model)

Artifact filename comes from a '<!-- artifact: NAME -->' comment on line 1.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path


def read_prompt(path: Path) -> tuple[str, str]:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"<!--\s*artifact:\s*(\S+)\s*-->\s*\n", text)
    if not m:
        raise SystemExit(
            f"prompt {path} missing '<!-- artifact: FILENAME -->' on line 1"
        )
    return m.group(1), text[m.end():].strip()


def extract_artifact(content: str, artifact_name: str) -> str | None:
    ext = artifact_name.rsplit(".", 1)[-1].lower()
    # Greedy: match from opening ```ext up to the LAST ``` in content.
    # Non-greedy would truncate when the artifact contains literal ``` (e.g.,
    # a markdown parser with `startsWith('```')`).
    m = re.search(rf"```{ext}\s*\n(.*)```", content, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).rstrip()
    # Fallback 1: any fenced block, greedy to last ```.
    m = re.search(r"```[a-zA-Z0-9_+-]*\s*\n(.*)```", content, re.DOTALL)
    if m:
        return m.group(1).rstrip()
    # Fallback 2: raw HTML without fences.
    if ext == "html":
        m = re.search(r"(<!DOCTYPE\s+html.*|<html[\s>].*)", content,
                      re.DOTALL | re.IGNORECASE)
        if m:
            return m.group(1).rstrip()
    return None


def _env_num(name: str, cast):
    """Return os.environ[name] cast to a number, or None if unset/blank."""
    v = os.environ.get(name)
    return cast(v) if v not in (None, "") else None


def call(base_url: str, model: str, prompt: str, max_tokens: int,
         enable_thinking: bool, temperature: float, timeout: int,
         sampling: dict | None = None) -> tuple[dict, float]:
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": temperature,
        # Pass enable_thinking explicitly (both True and False) so the toggle is
        # deterministic — verified honored by vLLM's qwen3 parser, not left to
        # the chat-template default.
        "chat_template_kwargs": {"enable_thinking": enable_thinking},
    }
    # Optional sampling knobs. Qwen3 needs these (it warns greedy/low-temp causes
    # endless repetition; non-thinking mode wants presence_penalty). Only sent
    # when set, so other OpenAI-compatible backends are unaffected. top_k/min_p
    # are vLLM extensions and ride along in the JSON body fine.
    for k, v in (sampling or {}).items():
        if v is not None:
            body[k] = v
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer not-needed",
        },
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = json.loads(resp.read().decode("utf-8"))
    return raw, time.time() - t0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt", type=Path)
    ap.add_argument("out_dir", type=Path)
    ap.add_argument("--base-url",
                    default=os.environ.get("LLM_BASE_URL",
                                           "http://localhost:8000/v1"))
    ap.add_argument("--model",
                    default=os.environ.get("LLM_MODEL",
                                           "google/gemma-4-26B-A4B-it"))
    ap.add_argument("--max-tokens", type=int,
                    default=int(os.environ.get("LLM_MAX_TOKENS", "32000")))
    ap.add_argument("--enable-thinking",
                    default=os.environ.get("LLM_ENABLE_THINKING", "true"))
    ap.add_argument("--temperature", type=float,
                    default=float(os.environ.get("LLM_TEMPERATURE", "0.2")))
    ap.add_argument("--top-p", type=float, default=_env_num("LLM_TOP_P", float))
    ap.add_argument("--top-k", type=int, default=_env_num("LLM_TOP_K", int))
    ap.add_argument("--presence-penalty", type=float,
                    default=_env_num("LLM_PRESENCE_PENALTY", float))
    ap.add_argument("--min-p", type=float, default=_env_num("LLM_MIN_P", float))
    ap.add_argument("--timeout", type=int,
                    default=int(os.environ.get("LLM_TIMEOUT", "1800")))
    args = ap.parse_args()

    sampling = {
        "top_p": args.top_p,
        "top_k": args.top_k,
        "presence_penalty": args.presence_penalty,
        "min_p": args.min_p,
    }

    enable_thinking = args.enable_thinking.lower() in ("1", "true", "yes", "on")
    artifact_name, prompt_text = read_prompt(args.prompt)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / "prompt.md").write_text(
        args.prompt.read_text(encoding="utf-8"), encoding="utf-8"
    )

    sampling_str = ", ".join(f"{k}={v}" for k, v in sampling.items()
                             if v is not None) or "defaults"
    print(f"[{args.prompt.name}] calling {args.model} "
          f"(thinking={enable_thinking}, temp={args.temperature}, "
          f"{sampling_str})...", flush=True)
    try:
        raw, duration = call(args.base_url, args.model, prompt_text,
                             args.max_tokens, enable_thinking,
                             args.temperature, args.timeout, sampling)
    except Exception as e:
        print(f"  FAILED: {e}", file=sys.stderr)
        (args.out_dir / "error.txt").write_text(str(e), encoding="utf-8")
        return 1

    (args.out_dir / "response.json").write_text(
        json.dumps(raw, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    msg = raw["choices"][0]["message"]
    content = msg.get("content") or ""
    reasoning = msg.get("reasoning") or msg.get("reasoning_content") or ""
    usage = raw.get("usage", {})
    finish_reason = raw["choices"][0].get("finish_reason")

    if reasoning:
        (args.out_dir / "thinking.md").write_text(reasoning, encoding="utf-8")

    artifact = extract_artifact(content, artifact_name)
    if artifact:
        (args.out_dir / artifact_name).write_text(artifact, encoding="utf-8")
        artifact_bytes = len(artifact.encode("utf-8"))
    else:
        (args.out_dir / "content.md").write_text(content, encoding="utf-8")
        artifact_bytes = 0

    meta = {
        "prompt": args.prompt.name,
        "artifact": artifact_name,
        "artifact_bytes": artifact_bytes,
        "duration_sec": round(duration, 2),
        "model": raw.get("model"),
        "finish_reason": finish_reason,
        "usage": usage,
        "thinking_chars": len(reasoning),
        "content_chars": len(content),
        "enable_thinking": enable_thinking,
        "temperature": args.temperature,
        "sampling": {k: v for k, v in sampling.items() if v is not None},
    }
    (args.out_dir / "meta.json").write_text(
        json.dumps(meta, indent=2), encoding="utf-8"
    )

    print(f"  done in {duration:.1f}s "
          f"(tokens: prompt={usage.get('prompt_tokens', '?')}, "
          f"completion={usage.get('completion_tokens', '?')}; "
          f"artifact={artifact_bytes}B; finish={finish_reason})", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
