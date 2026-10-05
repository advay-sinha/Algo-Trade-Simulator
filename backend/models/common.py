"""Shared validated types used by request models and route parameters."""

from __future__ import annotations

import re
from typing import List, Literal

from fastapi import HTTPException, status

# Tickers like AAPL, BRK-B, RELIANCE.NS, ^GSPC, EURUSD=X. Anything else never reaches Yahoo.
# "&" covers NSE listings such as M&M.NS; symbols are URL-encoded before any outbound request.
SYMBOL_PATTERN = r"^[A-Za-z0-9.^=&\-]{1,20}$"
SYMBOL_RE = re.compile(SYMBOL_PATTERN)
MAX_SYMBOLS_PER_REQUEST = 25

SimulationStatus = Literal["active", "paused", "completed", "archived"]

ChartRange = Literal["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"]
ChartInterval = Literal["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"]

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128
COMMON_PASSWORDS = frozenset(
    {
        "password",
        "password1",
        "password123",
        "12345678",
        "123456789",
        "1234567890",
        "11111111",
        "00000000",
        "qwerty123",
        "qwertyuiop",
        "iloveyou",
        "abc12345",
        "letmein1",
        "welcome1",
        "admin123",
        "passw0rd",
        "sunshine",
        "football",
        "baseball",
        "trustno1",
    }
)


def check_password_policy(password: str) -> str:
    if password.lower() in COMMON_PASSWORDS:
        raise ValueError("Password is too common; choose a less guessable one")
    return password


def parse_symbol_list(raw: str) -> List[str]:
    """Split a comma-separated symbols query value, validating every entry."""
    symbols = [item.strip().upper() for item in raw.split(",") if item.strip()]
    if len(symbols) > MAX_SYMBOLS_PER_REQUEST:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"At most {MAX_SYMBOLS_PER_REQUEST} symbols per request",
        )
    invalid = [symbol for symbol in symbols if not SYMBOL_RE.fullmatch(symbol)]
    if invalid:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid symbol format")
    return symbols
