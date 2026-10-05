"""Investable universes, point-in-time eligibility and rebalance calendars.

Universes are built from the offline symbol catalog's index tiers, i.e. from TODAY's index
constituents. Applied to past dates that is survivorship-biased (companies that dropped out or
delisted are missing, later listings are present), so every such universe carries the flag and
a caveat that reaches reports, the UI and the copilot.

Eligibility at session t uses only data up to and including t.
"""

from __future__ import annotations

import warnings
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

import numpy as np

from backend.research.snapshots import Snapshot
from backend.services import symbol_catalog

MAX_CUSTOM_SYMBOLS = 100
SURVIVORSHIP_CAVEAT = (
    "Built from today's index constituents: stocks that left the index or delisted are missing and later "
    "listings are included, which flatters historical results (survivorship bias)."
)
SECTOR_CAVEAT = "Sectors are today's industry classification, applied to all dates."

UNIVERSES: Dict[str, Dict[str, Any]] = {
    "nifty50-current": {
        "name": "Nifty 50 (current constituents)",
        "tiers": {2},
        "description": "The 50 stocks in the Nifty 50 today.",
    },
    "nifty100-current": {
        "name": "Nifty 100 (current constituents)",
        "tiers": {1, 2},
        "description": "The Nifty 50 plus the Nifty Next 50 as of today.",
    },
}


class UniverseError(ValueError):
    pass


def _nse_equities() -> List[Dict[str, Any]]:
    return [entry for entry in symbol_catalog.entries() if entry["exchange"] == "NSE" and entry["type"] == "EQ"]


def universe_symbols(universe_id: str) -> List[str]:
    spec = UNIVERSES.get(universe_id)
    if spec is None:
        raise UniverseError(f"Unknown universe: {universe_id}")
    return sorted(entry["symbol"] for entry in _nse_equities() if entry["tier"] in spec["tiers"])


def custom_symbols(symbols: Sequence[str]) -> List[str]:
    cleaned = sorted({symbol.strip().upper() for symbol in symbols if symbol.strip()})
    if not cleaned:
        raise UniverseError("A custom universe needs at least one symbol")
    if len(cleaned) > MAX_CUSTOM_SYMBOLS:
        raise UniverseError(f"At most {MAX_CUSTOM_SYMBOLS} symbols")
    known = {entry["symbol"] for entry in _nse_equities()}
    unknown = [symbol for symbol in cleaned if symbol not in known]
    if unknown:
        raise UniverseError(f"Not NSE equities in the catalog: {', '.join(unknown[:5])}")
    return cleaned


def sector_map(symbols: Sequence[str]) -> Dict[str, str]:
    out = {}
    for symbol in symbols:
        entry = symbol_catalog.lookup(symbol)
        out[symbol] = (entry or {}).get("sector") or "Unclassified"
    return out


def describe_universes() -> List[Dict[str, Any]]:
    return [
        {
            "id": universe_id,
            "name": spec["name"],
            "description": spec["description"],
            "symbolCount": len(universe_symbols(universe_id)),
            "survivorshipBiased": True,
            "caveats": [SURVIVORSHIP_CAVEAT, SECTOR_CAVEAT],
        }
        for universe_id, spec in UNIVERSES.items()
    ] + [
        {
            "id": "custom",
            "name": "Custom list",
            "description": f"Up to {MAX_CUSTOM_SYMBOLS} NSE equities from the catalog.",
            "symbolCount": None,
            "survivorshipBiased": True,
            "caveats": ["A list chosen today knows which companies survived; treat results as survivorship-biased.", SECTOR_CAVEAT],
        }
    ]


# ---------------------------------------------------------------------------------------------
# Eligibility


@dataclass(frozen=True)
class EligibilityRules:
    min_history: int = 1  # sessions with a close, including t
    liquidity_window: int = 63
    min_median_traded_value: float = 0.0  # INR, median of close * volume over the window
    price_floor: float = 0.0  # INR


def eligible_at(snapshot: Snapshot, t: int, rules: EligibilityRules = EligibilityRules()) -> np.ndarray:
    """Boolean mask over snapshot.symbols, using data up to and including session t only."""
    view = snapshot.view(t)
    close = view.field("close")
    volume = view.field("volume")
    has_close = np.isfinite(close)
    mask = has_close[-1] & (np.nan_to_num(volume[-1], nan=0.0) > 0)
    mask &= has_close.sum(axis=0) >= rules.min_history
    if rules.price_floor > 0:
        mask &= np.nan_to_num(close[-1], nan=0.0) >= rules.price_floor
    if rules.min_median_traded_value > 0:
        window = slice(max(0, t + 1 - rules.liquidity_window), t + 1)
        traded = close[window] * volume[window]
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN columns (not listed yet) -> NaN -> ineligible
            median = np.nanmedian(np.where(np.isfinite(traded), traded, np.nan), axis=0)
        mask &= np.nan_to_num(median, nan=0.0) >= rules.min_median_traded_value
    return mask


# ---------------------------------------------------------------------------------------------
# Rebalance calendars (decision sessions: the decision uses that session's close)


def rebalance_indices(snapshot: Snapshot, frequency: str, start: int = 0, end: Optional[int] = None) -> List[int]:
    """Decision sessions within [start, end]: 'monthly' = last session of each month, 'weekly' = last
    session of each ISO week, 'daily' = every session. A month/week still in progress at the end of the
    data counts only if the final session closes it (it can't be known to be the last one yet)."""
    last = snapshot.sessions - 1 if end is None else end
    dates = snapshot.dates
    if frequency == "daily":
        return list(range(start, last + 1))
    if frequency == "monthly":
        key = lambda d: (d.year, d.month)  # noqa: E731
    elif frequency == "weekly":
        key = lambda d: d.isocalendar()[:2]  # noqa: E731
    else:
        raise UniverseError(f"Unknown rebalance frequency: {frequency}")
    out = []
    for i in range(start, last + 1):
        nxt = i + 1
        if nxt < snapshot.sessions and key(dates[nxt]) != key(dates[i]):
            out.append(i)
    return out
