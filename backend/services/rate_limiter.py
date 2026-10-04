"""Fixed-window rate limiting with pluggable storage.

The in-memory backend only protects a single process. On serverless hosting every
instance has its own memory, so production must point RATE_LIMIT_STORAGE_URI at a
shared store (Redis backend arrives with the production-hardening work).
"""

from __future__ import annotations

import logging
import math
import time
from typing import Callable, Dict, Protocol, Tuple

from fastapi import HTTPException, Request, status

from backend.config import HOSTED, settings
from backend.services import upstash

logger = logging.getLogger("algo_trade_backend.rate_limit")


class RateLimitStorage(Protocol):
    def hit(self, key: str, window_seconds: int) -> Tuple[int, float]:
        """Record one hit; return (hits in current window, seconds until the window resets)."""


class MemoryRateLimitStorage:
    def __init__(self, max_keys: int = 10_000) -> None:
        self._windows: Dict[str, Tuple[float, int]] = {}
        self._max_keys = max_keys

    def hit(self, key: str, window_seconds: int) -> Tuple[int, float]:
        current = time.monotonic()
        started, count = self._windows.get(key, (current, 0))
        if current - started >= window_seconds:
            started, count = current, 0
        count += 1
        self._windows[key] = (started, count)
        if len(self._windows) > self._max_keys:
            self._prune(current, window_seconds)
        return count, max(window_seconds - (current - started), 0.0)

    def _prune(self, current: float, window_seconds: int) -> None:
        expired = [key for key, (started, _) in self._windows.items() if current - started >= window_seconds]
        for key in expired:
            self._windows.pop(key, None)


class UpstashRateLimitStorage:
    """Shared counters (one key per client per window) so limits hold across instances.
    Fails open: if Redis is unreachable, requests are allowed and a warning is logged."""

    def hit(self, key: str, window_seconds: int) -> Tuple[int, float]:
        current = time.time()
        bucket = int(current // window_seconds)
        reset_in = window_seconds - (current % window_seconds)
        try:
            count, _ = upstash.pipeline([["INCR", f"rl:{key}:{bucket}"], ["EXPIRE", f"rl:{key}:{bucket}", window_seconds + 1]])
            return int(count), reset_in
        except Exception:  # noqa: BLE001
            logger.warning("Shared rate-limit storage unavailable; allowing request")
            return 0, reset_in


def build_storage(uri: str) -> RateLimitStorage:
    """RATE_LIMIT_STORAGE_URI: "memory://" forces per-process; "upstash" (or empty = auto) uses
    Upstash Redis when its REST credentials are present."""
    choice = (uri or "").strip().lower()
    if choice != "memory://" and upstash.configured():
        logger.info("Rate limiting: shared (Upstash Redis)")
        return UpstashRateLimitStorage()
    if choice.startswith("upstash"):
        logger.warning("RATE_LIMIT_STORAGE_URI=upstash but Upstash credentials are missing; using per-process memory")
    elif HOSTED:
        logger.info("Rate limiting: per-instance memory (shared only with Upstash configured)")
    return MemoryRateLimitStorage()


def storage_kind() -> str:
    return "shared" if isinstance(_storage, UpstashRateLimitStorage) else "memory"


_storage: RateLimitStorage = build_storage(settings.rate_limit_storage_uri)


def reset() -> None:
    """Clear all counters (tests and local tooling)."""
    global _storage
    _storage = build_storage(settings.rate_limit_storage_uri)


def client_ip(request: Request) -> str:
    # Behind a hosting proxy (Vercel rewrite, Koyeb edge) the socket peer is the proxy and the first
    # forwarded hop is the client. Trusted only when hosted (TRUST_PROXY_HEADERS) — locally it could
    # be spoofed freely.
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "")
        first_hop = forwarded.split(",", 1)[0].strip()
        if first_hop:
            return first_hop
    return request.client.host if request.client else "unknown"


def rate_limit(scope: str, limit: int, window_seconds: int = 60) -> Callable[[Request], None]:
    """FastAPI dependency factory: allow `limit` requests per client IP per window."""

    def dependency(request: Request) -> None:
        if limit <= 0:
            return
        hits, reset_in = _storage.hit(f"{scope}:{client_ip(request)}", window_seconds)
        if hits > limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please wait and try again.",
                headers={"Retry-After": str(max(math.ceil(reset_in), 1))},
            )

    return dependency
