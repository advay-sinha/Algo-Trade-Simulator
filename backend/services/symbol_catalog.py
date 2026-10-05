"""Read-only access to the offline symbol catalog (shared/symbols.json).

The same file powers the browser's type-ahead search. Here it resolves ISINs to tickers, looks up
listing names, and gives the offline search fallback real company names. Loaded lazily once per
process from a path relative to this module (never the working directory); never written.
"""

from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("algo_trade_backend.symbols")

CATALOG_PATH = Path(__file__).resolve().parents[2] / "shared" / "symbols.json"
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


@lru_cache(maxsize=1)
def _catalog() -> Dict[str, Any]:
    try:
        raw = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        logger.warning("Symbol catalog unavailable at %s", CATALOG_PATH.name)
        return {"generatedAt": None, "entries": {}, "isin": {}}
    fields = raw["fields"]
    entries: Dict[str, Dict[str, Any]] = {}
    by_isin: Dict[str, str] = {}
    for row in raw["rows"]:
        item = dict(zip(fields, row))
        entry = {
            "symbol": item["s"],
            "name": item["n"],
            "exchange": item["x"],
            "type": item["t"],
            "isin": item.get("i"),
            "tier": item.get("k", 0),
            "sector": item.get("c"),
            "aliases": item.get("a") or [],
        }
        entries[entry["symbol"]] = entry
        if entry["isin"] and entry["isin"] not in by_isin:
            by_isin[entry["isin"]] = entry["symbol"]
    return {"generatedAt": raw.get("generatedAt"), "entries": entries, "isin": by_isin}


def generated_at() -> Optional[str]:
    return _catalog()["generatedAt"]


def lookup(symbol: str) -> Optional[Dict[str, Any]]:
    return _catalog()["entries"].get(symbol.strip().upper())


def resolve_isin(isin: str) -> Optional[str]:
    return _catalog()["isin"].get(isin.strip().upper())


def search(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Simple ranked match (ticker, alias, name prefix, name contains) for server-side fallbacks."""
    needle = _NON_ALNUM.sub(" ", query.lower()).strip()
    compact = needle.replace(" ", "")
    if not compact:
        return []
    scored = []
    for entry in _catalog()["entries"].values():
        key = _NON_ALNUM.sub("", entry["symbol"].lower().split(".")[0])
        name = _NON_ALNUM.sub(" ", entry["name"].lower()).strip()
        aliases = [_NON_ALNUM.sub(" ", alias).strip() for alias in entry["aliases"]]
        if key == compact or needle in aliases:
            score = 4
        elif key.startswith(compact):
            score = 3
        elif name.startswith(needle) or any(alias.startswith(needle) for alias in aliases):
            score = 2
        elif needle in name:
            score = 1
        else:
            continue
        scored.append((score, entry["tier"], entry["symbol"], entry))
    scored.sort(key=lambda item: (-item[0], -item[1], item[2]))
    return [item[3] for item in scored[:limit]]
