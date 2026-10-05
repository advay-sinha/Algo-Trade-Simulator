"""AMFI daily NAV file: mutual-fund scheme lookup by ISIN (latest NAV, scheme name, category).

Source: https://www.amfiindia.com/spages/NAVAll.txt (public, no account; ~1.5 MB, refreshed daily).
Parsed once per process and kept for a day; nothing is written to disk. Blocking — call through
asyncio.to_thread. The file carries no personal data.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger("algo_trade_backend.amfi")

NAV_URL = "https://www.amfiindia.com/spages/NAVAll.txt"
TTL_SECONDS = 24 * 60 * 60

_lock = threading.Lock()
_state: Dict[str, Any] = {"loaded": 0.0, "by_isin": {}, "by_code": {}}


class AmfiUnavailable(Exception):
    """AMFI couldn't be reached or parsed; callers report it without guessing."""


def parse(text: str) -> Dict[str, Dict[str, Dict[str, Any]]]:
    """Columns are located by header name (AMFI has changed the column set before)."""
    by_isin: Dict[str, Dict[str, Any]] = {}
    by_code: Dict[str, Dict[str, Any]] = {}
    category: Optional[str] = None
    house: Optional[str] = None
    columns: Dict[str, int] = {}

    def column(*names: str) -> Optional[int]:
        for name in names:
            for header, position in columns.items():
                if header.startswith(name):
                    return position
        return None

    for raw in text.splitlines():
        line = raw.strip().replace("�", "'")  # the source file carries broken apostrophes
        if not line:
            continue
        parts = [part.strip() for part in line.split(";")]
        if parts[0].lower() == "scheme code":
            columns = {header.lower(): position for position, header in enumerate(parts)}
            continue
        if len(parts) < 5 or not columns:
            # Section headings: "Open Ended Schemes(Equity Scheme - Large Cap Fund)" then the fund house.
            if "(" in line and "Scheme" in line:
                category = line[line.find("(") + 1 : line.rfind(")")] or line
            else:
                house = line
            continue
        get = lambda position: parts[position] if position is not None and position < len(parts) else ""  # noqa: E731
        try:
            nav_value = float(get(column("net asset value")))
        except ValueError:
            continue
        name = " - ".join(item for item in (get(column("scheme name")), get(column("plan")), get(column("option"))) if item)
        code = get(column("scheme code"))
        scheme = {"schemeCode": code, "name": name, "nav": nav_value, "navDate": get(column("date")), "category": category, "fundHouse": house}
        by_code[code] = scheme
        for isin in (get(column("isin div payout", "isin growth")), get(column("isin div reinvestment"))):
            if len(isin) == 12 and isin.startswith("IN"):
                by_isin[isin.upper()] = scheme
    return {"by_isin": by_isin, "by_code": by_code}


def _ensure_loaded() -> None:
    with _lock:
        if _state["by_isin"] and time.monotonic() - _state["loaded"] < TTL_SECONDS:
            return
        try:
            response = requests.get(NAV_URL, timeout=20, headers={"User-Agent": "Mozilla/5.0 AlgoTradeLab"})
            response.raise_for_status()
            response.encoding = "utf-8"
            parsed = parse(response.text)
        except (requests.RequestException, ValueError) as exc:
            logger.warning("AMFI NAV file unavailable: %s", type(exc).__name__)
            if not _state["by_isin"]:
                raise AmfiUnavailable("AMFI NAV data is unavailable right now") from exc
            return  # keep serving the previous day's copy
        if not parsed["by_isin"]:
            raise AmfiUnavailable("AMFI NAV data came back empty")
        _state.update(parsed, loaded=time.monotonic())
        logger.info("AMFI NAV file loaded: %d schemes", len(parsed["by_code"]))


def scheme_by_isin(isin: str) -> Optional[Dict[str, Any]]:
    _ensure_loaded()
    return _state["by_isin"].get(isin.strip().upper())


def scheme_by_code(code: str) -> Optional[Dict[str, Any]]:
    _ensure_loaded()
    return _state["by_code"].get(str(code).strip())


# --- NAV history (for fund risk figures) -----------------------------------------------------------
# AMFI's daily file only carries the latest NAV. History comes from the free mfapi.in service,
# which republishes AMFI NAVs per scheme; payloads are flagged with source "mfapi".
HISTORY_URL = "https://api.mfapi.in/mf/{code}"
HISTORY_TTL_SECONDS = 6 * 60 * 60
_history_cache: Dict[str, Any] = {}


def nav_history(code: str) -> Optional[Dict[str, Any]]:
    """{"points": [(date_iso, nav), ...] oldest first, "source": "mfapi"} or None when unavailable."""
    key = str(code).strip()
    if not key.isdigit():
        return None
    cached = _history_cache.get(key)
    if cached and time.monotonic() - cached[0] < HISTORY_TTL_SECONDS:
        return cached[1]
    try:
        response = requests.get(HISTORY_URL.format(code=key), timeout=15, headers={"User-Agent": "Mozilla/5.0 AlgoTradeLab"})
        response.raise_for_status()
        rows = response.json().get("data") or []
    except (requests.RequestException, ValueError):
        logger.warning("Fund NAV history unavailable for scheme %s", key)
        return None
    points = []
    for row in rows:
        try:
            day, month, year = str(row["date"]).split("-")
            points.append((f"{year}-{month}-{day}", float(row["nav"])))
        except (KeyError, ValueError):
            continue
    payload = {"points": sorted(points), "source": "mfapi"}
    _history_cache[key] = (time.monotonic(), payload)
    return payload
