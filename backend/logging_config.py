"""Structured logging: one JSON object per line on stdout (what hosting platforms collect), plus a
request-id middleware that tags every request and logs method, path, status, and duration.

LOG_FORMAT=json|text (default: json on Vercel, text locally), LOG_LEVEL (default INFO).
Query strings are never logged (they could carry user input); request bodies are never logged.
"""

from __future__ import annotations

import json
import logging
import os
import re
import sys
import time
import uuid
from contextvars import ContextVar
from typing import Any, Callable, Dict

from backend.config import ON_VERCEL

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
_configured = False


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)) + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id_var.get(),
        }
        for key in ("method", "path", "status", "duration_ms"):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


class TextFormatter(logging.Formatter):
    def __init__(self) -> None:
        super().__init__("%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s")

    def format(self, record: logging.LogRecord) -> str:
        record.request_id = request_id_var.get()
        line = super().format(record)
        if hasattr(record, "path"):
            line += f" {getattr(record, 'method', '')} {record.path} {getattr(record, 'status', '')} {getattr(record, 'duration_ms', '')}ms"
        return line


def configure_logging() -> None:
    """Idempotent; safe to call at import time (no startup hook needed)."""
    global _configured
    if _configured:
        return
    fmt = os.getenv("LOG_FORMAT", "json" if ON_VERCEL else "text").lower()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter() if fmt == "json" else TextFormatter())
    app_logger = logging.getLogger("algo_trade_backend")
    app_logger.handlers = [handler]
    app_logger.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())
    app_logger.propagate = False
    _configured = True


class RequestContextMiddleware:
    """Pure ASGI middleware (keeps streaming responses unbuffered)."""

    def __init__(self, app: Callable) -> None:
        self.app = app
        self.logger = logging.getLogger("algo_trade_backend.http")

    async def __call__(self, scope: Dict[str, Any], receive: Callable, send: Callable) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        incoming = dict(scope.get("headers") or []).get(b"x-request-id", b"").decode("latin-1")
        request_id = incoming if _REQUEST_ID_RE.match(incoming) else uuid.uuid4().hex
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        status_holder = {"status": 500}

        async def send_wrapper(message: Dict[str, Any]) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                headers = list(message.get("headers") or [])
                headers.append((b"x-request-id", request_id.encode("latin-1")))
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            self.logger.info(
                "request",
                extra={
                    "method": scope.get("method"),
                    "path": scope.get("path"),
                    "status": status_holder["status"],
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                },
            )
            request_id_var.reset(token)
