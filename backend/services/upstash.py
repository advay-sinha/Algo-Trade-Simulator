"""Minimal Upstash Redis REST client (HTTP, no driver dependency — serverless friendly).

Configured by UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (the Vercel Marketplace
integration provides KV_REST_API_URL + KV_REST_API_TOKEN, also accepted). Calls are blocking:
call them from threads (asyncio.to_thread) in async code. Short timeouts; callers fail open.
"""

from __future__ import annotations

import os
from typing import Any, List, Optional

import requests

TIMEOUT_SECONDS = 2.0


def _url() -> Optional[str]:
    return (os.getenv("UPSTASH_REDIS_REST_URL") or os.getenv("KV_REST_API_URL") or "").strip() or None


def _token() -> Optional[str]:
    return (os.getenv("UPSTASH_REDIS_REST_TOKEN") or os.getenv("KV_REST_API_TOKEN") or "").strip() or None


def configured() -> bool:
    return bool(_url() and _token())


def command(*args: Any) -> Any:
    response = requests.post(_url(), json=[str(arg) for arg in args], headers={"Authorization": f"Bearer {_token()}"}, timeout=TIMEOUT_SECONDS)
    response.raise_for_status()
    body = response.json()
    if "error" in body:
        raise RuntimeError("Upstash command failed")
    return body.get("result")


def pipeline(commands: List[List[Any]]) -> List[Any]:
    response = requests.post(
        f"{_url().rstrip('/')}/pipeline",
        json=[[str(arg) for arg in cmd] for cmd in commands],
        headers={"Authorization": f"Bearer {_token()}"},
        timeout=TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    results = response.json()
    if any("error" in item for item in results):
        raise RuntimeError("Upstash pipeline failed")
    return [item.get("result") for item in results]
