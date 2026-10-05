"""Cross-sectional (panel) dataset for stock ranking (Phase 13d).

One row per (decision date t, eligible stock). Features use data up to and including t's close;
the target is the executable forward return: adjusted open of t+1 to adjusted open of t+1+h
(h = 20 sessions by default), minus the equal-weight mean of the same return across the stocks
eligible at t. The index has no open prices in the snapshot, so the eligible universe is the
benchmark; subtracting a per-date constant leaves every ranking and rank IC unchanged.

A label "matures" at session t+1+h. Rows whose window runs past the data have no target and are
never trained on; purging by `label_end` keeps training rows away from evaluation dates.
Cross-sectional transforms (ranks) are computed within a date only.
"""

from __future__ import annotations

import hashlib
import json
import warnings
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

from backend.research.snapshots import Snapshot
from backend.research.universe import EligibilityRules, eligible_at, sector_map

HORIZON = 20
WARMUP = 253  # longest lookback (252) + 1
NUMERIC_FAMILIES: Dict[str, Tuple[str, ...]] = {
    "momentum": ("ret_5", "ret_21", "ret_63", "ret_126", "ret_252", "mom_12_1"),
    "volatility": ("vol_21", "vol_63"),
    "volume": ("rel_volume",),
    "benchmark_relative": ("rel_21", "rel_63", "rel_252"),
}
FAMILY_DESCRIPTIONS = {
    "momentum": "Trailing returns over 1 week to 12 months and 12-1 momentum.",
    "volatility": "Trailing daily-return volatility (1 and 3 months).",
    "volume": "Recent volume relative to its 3-month median.",
    "benchmark_relative": "Trailing return minus the index's over the same window.",
    "sector": "Industry (current classification) as indicator columns.",
}


@dataclass(frozen=True)
class Panel:
    frame: pd.DataFrame  # columns: date, t (session index), symbol, features..., target, label_end
    features: Tuple[str, ...]
    sectors: Tuple[str, ...]
    horizon: int

    @property
    def schema_hash(self) -> str:
        return schema_hash(self.features)


def schema_hash(features: Sequence[str]) -> str:
    return hashlib.sha256(json.dumps({"features": list(features), "dtype": "float64"}, separators=(",", ":")).encode()).hexdigest()


def _ret(values: np.ndarray, t: int, lookback: int, skip: int = 0) -> np.ndarray:
    if t - lookback < 0:
        return np.full(values.shape[1], np.nan)
    with np.errstate(divide="ignore", invalid="ignore"):
        return values[t - skip] / values[t - lookback] - 1


def _vol(adj: np.ndarray, t: int, window: int) -> np.ndarray:
    block = adj[max(0, t - window) : t + 1]
    with np.errstate(divide="ignore", invalid="ignore"):
        returns = block[1:] / block[:-1] - 1
    returns = np.where(np.isfinite(returns), returns, np.nan)
    with np.errstate(all="ignore"):
        count = np.sum(np.isfinite(returns), axis=0)
        out = np.nanstd(returns, axis=0, ddof=1) if len(returns) > 1 else np.full(adj.shape[1], np.nan)
    out = np.where(count >= window // 2, out, np.nan)
    return out * np.sqrt(252)


def features_at(snapshot: Snapshot, t: int) -> Dict[str, np.ndarray]:
    """Numeric features for every snapshot symbol at session t (data up to t only)."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # not-yet-listed symbols: all-NaN columns -> NaN
        return _features_at(snapshot, t)


def _features_at(snapshot: Snapshot, t: int) -> Dict[str, np.ndarray]:
    view = snapshot.view(t)
    adj = view.field("adj_close")
    volume = view.field("volume")
    bench = view.benchmark("adj_close")
    out: Dict[str, np.ndarray] = {}
    for window in (5, 21, 63, 126, 252):
        out[f"ret_{window}"] = _ret(adj, t, window)
    out["mom_12_1"] = _ret(adj, t, 252, 21)
    out["vol_21"] = _vol(adj, t, 21)
    out["vol_63"] = _vol(adj, t, 63)
    with np.errstate(all="ignore"):
        recent = np.nanmean(np.where(volume[max(0, t - 20) : t + 1] > 0, volume[max(0, t - 20) : t + 1], np.nan), axis=0)
        base = np.nanmedian(np.where(volume[max(0, t - 62) : t + 1] > 0, volume[max(0, t - 62) : t + 1], np.nan), axis=0)
        out["rel_volume"] = recent / base
    for window in (21, 63, 252):
        bench_ret = bench[t] / bench[t - window] - 1 if t - window >= 0 and np.isfinite(bench[t]) and np.isfinite(bench[t - window]) else np.nan
        out[f"rel_{window}"] = out[f"ret_{window}"] - bench_ret
    return out


def _adjusted_open(snapshot: Snapshot) -> np.ndarray:
    arrays = snapshot.arrays
    with np.errstate(divide="ignore", invalid="ignore"):
        factor = arrays["adj_close"] / arrays["close"]
    return arrays["open"] * factor


def _cross_sectional_rank(values: np.ndarray) -> np.ndarray:
    """Percentile rank in (0, 1] within one date; NaN stays NaN."""
    series = pd.Series(values)
    return series.rank(pct=True, method="average").to_numpy()


def build_panel(
    snapshot: Snapshot,
    decision_indices: Sequence[int],
    *,
    rules: Optional[EligibilityRules] = None,
    horizon: int = HORIZON,
    rank_transform: bool = True,
) -> Panel:
    rules = rules or EligibilityRules(min_history=WARMUP)
    adj_open = _adjusted_open(snapshot)
    sectors_by_symbol = sector_map(snapshot.symbols)
    sector_names = tuple(sorted(set(sectors_by_symbol.values())))
    numeric = [name for family in NUMERIC_FAMILIES.values() for name in family]
    sector_columns = [f"sector_{name}" for name in sector_names]
    rows: List[Dict[str, object]] = []
    for t in decision_indices:
        if t < WARMUP:
            continue
        eligible = eligible_at(snapshot, t, rules)
        if not eligible.any():
            continue
        feats = features_at(snapshot, t)
        entry, exit_ = t + 1, t + 1 + horizon
        if exit_ < snapshot.sessions:
            with np.errstate(divide="ignore", invalid="ignore"):
                forward = adj_open[exit_] / adj_open[entry] - 1
            forward = np.where(eligible & np.isfinite(forward), forward, np.nan)
            target = forward - np.nanmean(forward) if np.isfinite(forward).any() else forward
        else:
            target = np.full(len(snapshot.symbols), np.nan)
        columns = {name: np.where(eligible, values, np.nan) for name, values in feats.items()}
        if rank_transform:
            # Ranks within the date; benchmark-relative returns stay raw (their per-date ranks would
            # just repeat the plain return ranks, since the index return is the same for every stock).
            columns = {name: values if name.startswith("rel_") and name != "rel_volume" else _cross_sectional_rank(values) for name, values in columns.items()}
        for j in np.flatnonzero(eligible):
            row: Dict[str, object] = {"date": snapshot.dates[t].isoformat(), "t": t, "symbol": snapshot.symbols[j]}
            for name in numeric:
                row[name] = float(columns[name][j])
            sector = sectors_by_symbol[snapshot.symbols[j]]
            for name, column in zip(sector_names, sector_columns):
                row[column] = 1.0 if sector == name else 0.0
            row["target"] = float(target[j])
            row["label_end"] = exit_
            rows.append(row)
    frame = pd.DataFrame(rows)
    features = tuple(numeric + sector_columns)
    if frame.empty:
        frame = pd.DataFrame(columns=["date", "t", "symbol", *features, "target", "label_end"])
    return Panel(frame=frame, features=features, sectors=sector_names, horizon=horizon)


def training_rows(panel: Panel, decision_t: int, embargo: int = 1) -> pd.DataFrame:
    """Rows usable to train a model at decision session `decision_t`: matured labels whose window
    ended at least `embargo` sessions before the decision, with complete features."""
    frame = panel.frame
    usable = frame[(frame["label_end"] <= decision_t - embargo) & frame["target"].notna()]
    return usable.dropna(subset=list(panel.features))
