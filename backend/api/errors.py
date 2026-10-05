"""Validation errors without echoed input.

FastAPI's default 422 body includes each offending `input` value (and `ctx`), so a password, PAN or
phone number typed into the wrong field would be sent straight back. This handler keeps only the
location, error type and message.
"""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def safe_errors(errors: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [{"loc": list(error.get("loc", ())), "type": error.get("type"), "msg": error.get("msg")} for error in errors]


async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": safe_errors(exc.errors())})
