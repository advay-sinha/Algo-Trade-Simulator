"""Immutable, versioned daily price snapshots for research runs.

A snapshot freezes one download of a universe so every research run can be replayed exactly:
Yahoo revises history, so live data in the loop would make results drift.

Conventions (decided from the Phase 13.0 probes):
- `open/high/low/close` are split-adjusted, NOT dividend-adjusted (yfinance auto_adjust=False).
  Fills, holdings and marks use them. Yahoo books bonus issues as splits; prices already reflect
  both, so split events are recorded in the coverage but never applied to share counts.
- `adj_close` is additionally dividend-adjusted and is for signals only.
- `dividend` is cash per share on the ex-date; the engine credits it to holders of the prior close.
  Using adj_close returns AND dividend credits would double count.
- Calendar: a session is a weekday date on which at least half of the listed symbols traded
  (volume > 0). Yahoo's flat zero-volume holiday placeholders and weekend special sessions are
  excluded and listed. A symbol with zero volume on a real session is not tradable that day.
- The benchmark is aligned to this calendar (the ^NSEI series misses real sessions).
- The version is the sha256 of the canonical array bytes, so identical data → identical version.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger("algo_trade_backend.research.snapshots")

SNAPSHOT_FORMAT = 1
FIELDS: Tuple[str, ...] = ("open", "high", "low", "close", "adj_close", "volume", "dividend")
BENCHMARK_FIELDS: Tuple[str, ...] = ("close", "adj_close")
SESSION_QUORUM = 0.5
_SOURCE_COLUMNS = {
    "open": "Open",
    "high": "High",
    "low": "Low",
    "close": "Close",
    "adj_close": "Adj Close",
    "volume": "Volume",
    "dividend": "Dividends",
}


class SnapshotError(ValueError):
    """Raised for snapshots that can't be built or don't verify."""


@dataclass(frozen=True)
class Snapshot:
    version: str
    universe: str
    symbols: Tuple[str, ...]
    dates: Tuple[date, ...]
    arrays: Mapping[str, np.ndarray]  # field -> (sessions, symbols) float64, NaN = no bar
    benchmark_symbol: str
    benchmark: Mapping[str, np.ndarray]  # field -> (sessions,), NaN where the index has no bar
    meta: Dict[str, Any] = field(default_factory=dict)

    @property
    def sessions(self) -> int:
        return len(self.dates)

    def index_of(self, day: date) -> int:
        """Position of the last session on or before `day` (-1 if none)."""
        return int(np.searchsorted(np.array(self.dates, dtype="datetime64[D]"), np.datetime64(day, "D"), side="right")) - 1

    def view(self, end: int) -> "SnapshotView":
        """Everything known at the close of session `end` (inclusive) — the only data a decision may see."""
        if not 0 <= end < self.sessions:
            raise IndexError(end)
        return SnapshotView(self, end)


@dataclass(frozen=True)
class SnapshotView:
    snapshot: Snapshot
    end: int

    def field(self, name: str) -> np.ndarray:
        return self.snapshot.arrays[name][: self.end + 1]

    def benchmark(self, name: str) -> np.ndarray:
        return self.snapshot.benchmark[name][: self.end + 1]

    @property
    def dates(self) -> Tuple[date, ...]:
        return self.snapshot.dates[: self.end + 1]

    @property
    def symbols(self) -> Tuple[str, ...]:
        return self.snapshot.symbols


# ---------------------------------------------------------------------------------------------
# Building


def _local_dates(index: pd.Index) -> List[date]:
    if isinstance(index, pd.DatetimeIndex):
        return list(index.date)  # yfinance daily bars are stamped in the exchange's timezone
    return [pd.Timestamp(value).date() for value in index]


def _normalize_frame(frame: pd.DataFrame) -> pd.DataFrame:
    """Raw yfinance frame -> date-indexed frame with our field names (missing columns -> NaN / 0)."""
    out = pd.DataFrame(index=pd.Index(_local_dates(frame.index), name="date"))
    for name, column in _SOURCE_COLUMNS.items():
        if column in frame:
            out[name] = pd.to_numeric(frame[column], errors="coerce").to_numpy(dtype=float)
        elif name == "adj_close" and "Close" in frame:
            out[name] = pd.to_numeric(frame["Close"], errors="coerce").to_numpy(dtype=float)
        elif name == "dividend":
            out[name] = 0.0
        else:
            out[name] = np.nan
    out["split"] = pd.to_numeric(frame["Stock Splits"], errors="coerce").to_numpy(dtype=float) if "Stock Splits" in frame else 0.0
    out = out[~out.index.duplicated(keep="last")].sort_index()
    return out[out["close"].notna()]


def session_calendar(frames: Mapping[str, pd.DataFrame], quorum: float = SESSION_QUORUM) -> Tuple[List[date], Dict[str, List[str]]]:
    """Sessions per the 13.0 rule, plus the dates excluded and why."""
    traded: Dict[date, int] = {}
    listed: Dict[date, int] = {}
    firsts = {symbol: frame.index.min() for symbol, frame in frames.items() if len(frame)}
    lasts = {symbol: frame.index.max() for symbol, frame in frames.items() if len(frame)}
    all_dates = sorted({day for frame in frames.values() for day in frame.index})
    for symbol, frame in frames.items():
        for day, volume in zip(frame.index, frame["volume"].to_numpy()):
            if np.isfinite(volume) and volume > 0:
                traded[day] = traded.get(day, 0) + 1
    for day in all_dates:
        listed[day] = sum(1 for symbol in firsts if firsts[symbol] <= day <= lasts[symbol])
    sessions: List[date] = []
    excluded: Dict[str, List[str]] = {"weekend": [], "noTrading": []}
    for day in all_dates:
        if day.weekday() >= 5:
            excluded["weekend"].append(day.isoformat())
        elif listed[day] and traded.get(day, 0) >= quorum * listed[day]:
            sessions.append(day)
        else:
            excluded["noTrading"].append(day.isoformat())
    return sessions, excluded


def build_snapshot(
    raw_frames: Mapping[str, pd.DataFrame],
    raw_benchmark: pd.DataFrame,
    *,
    universe: str,
    benchmark_symbol: str,
    source: str,
    downloaded_at: str,
    survivorship_biased: bool,
    caveats: Sequence[str] = (),
) -> Snapshot:
    frames = {symbol: _normalize_frame(frame) for symbol, frame in raw_frames.items()}
    frames = {symbol: frame for symbol, frame in frames.items() if len(frame)}
    if not frames:
        raise SnapshotError("No symbol returned any data")
    symbols = tuple(sorted(frames))
    sessions, excluded = session_calendar(frames)
    if len(sessions) < 2:
        raise SnapshotError("Fewer than two trading sessions")
    session_index = pd.Index(sessions)
    arrays: Dict[str, np.ndarray] = {}
    coverage: List[Dict[str, Any]] = []  # a list, not a dict: symbols contain dots (bad Mongo keys)
    columns: Dict[str, List[np.ndarray]] = {name: [] for name in FIELDS}
    for symbol in symbols:
        frame = frames[symbol]
        # A dividend whose ex-date fell on an excluded date moves to the next session.
        dividends = frame["dividend"].fillna(0.0)
        dividends = dividends[dividends != 0]
        moved = pd.Series(0.0, index=session_index)
        for day, amount in dividends.items():
            position = session_index.searchsorted(day)
            if position < len(session_index):
                moved.iloc[position] += float(amount)
        aligned = frame.reindex(session_index)
        for name in FIELDS:
            values = moved.to_numpy(dtype=float) if name == "dividend" else aligned[name].to_numpy(dtype=float)
            columns[name].append(values)
        present = aligned["close"].notna().to_numpy()
        first = int(np.argmax(present)) if present.any() else None
        volume = aligned["volume"].to_numpy(dtype=float)
        splits = frame["split"].fillna(0.0)
        coverage.append({
            "symbol": symbol,
            "firstDate": sessions[first].isoformat() if first is not None else None,
            "lastDate": sessions[len(present) - 1 - int(np.argmax(present[::-1]))].isoformat() if present.any() else None,
            "bars": int(present.sum()),
            "missingSessions": int((~present[first:]).sum()) if first is not None else 0,
            "zeroVolumeSessions": int(((volume == 0) & present).sum()),
            "dividends": int(len(dividends)),
            "splits": [{"date": day.isoformat(), "factor": float(factor)} for day, factor in splits[splits != 0].items()],
        })
    for name in FIELDS:
        arrays[name] = np.column_stack(columns[name]).astype(np.float64)

    bench = _normalize_frame(raw_benchmark).reindex(session_index) if len(raw_benchmark) else pd.DataFrame(index=session_index, columns=list(BENCHMARK_FIELDS), dtype=float)
    benchmark = {name: bench[name].to_numpy(dtype=float) for name in BENCHMARK_FIELDS}
    bench_present = np.isfinite(benchmark["close"])
    meta = {
        "format": SNAPSHOT_FORMAT,
        "universe": universe,
        "benchmarkSymbol": benchmark_symbol,
        "source": source,
        "downloadedAt": downloaded_at,
        "survivorshipBiased": bool(survivorship_biased),
        "caveats": list(caveats),
        "period": {"start": sessions[0].isoformat(), "end": sessions[-1].isoformat(), "sessions": len(sessions)},
        "symbolCount": len(symbols),
        "excludedDates": excluded,
        "benchmarkCoverage": {"sessions": int(bench_present.sum()), "missing": int((~bench_present).sum())},
        "coverage": coverage,
        "coverageSummary": {
            "symbols": len(coverage),
            "lateListings": sum(1 for item in coverage if item["firstDate"] and item["firstDate"] > sessions[0].isoformat()),
            "missingSessions": sum(item["missingSessions"] for item in coverage),
            "zeroVolumeSessions": sum(item["zeroVolumeSessions"] for item in coverage),
        },
        "conventions": {
            "prices": "Open/high/low/close are split-adjusted, not dividend-adjusted; fills and marks use them.",
            "signals": "adj_close is split- and dividend-adjusted; for signals only.",
            "dividends": "Cash per share credited on the ex-date to shares held at the prior close.",
            "calendar": "Weekday dates on which at least half the listed symbols traded; holiday placeholders and weekend special sessions excluded.",
        },
    }
    snapshot = Snapshot(
        version="",
        universe=universe,
        symbols=symbols,
        dates=tuple(sessions),
        arrays=_freeze(arrays),
        benchmark_symbol=benchmark_symbol,
        benchmark=_freeze(benchmark),
        meta=meta,
    )
    version = compute_version(snapshot)
    meta["version"] = version
    return Snapshot(**{**snapshot.__dict__, "version": version})


def _freeze(arrays: Mapping[str, np.ndarray]) -> Dict[str, np.ndarray]:
    frozen = {}
    for name, values in arrays.items():
        array = np.ascontiguousarray(values, dtype=np.float64).copy()
        array.setflags(write=False)
        frozen[name] = array
    return frozen


# ---------------------------------------------------------------------------------------------
# Version, serialization


def _canonical(values: np.ndarray) -> bytes:
    clean = np.where(np.isnan(values), np.nan, values).astype("<f8")  # one NaN bit pattern
    return np.ascontiguousarray(clean).tobytes()


def compute_version(snapshot: Snapshot) -> str:
    digest = hashlib.sha256()
    header = {
        "format": SNAPSHOT_FORMAT,
        "universe": snapshot.universe,
        "symbols": list(snapshot.symbols),
        "dates": [day.isoformat() for day in snapshot.dates],
        "benchmark": snapshot.benchmark_symbol,
        "fields": list(FIELDS),
    }
    digest.update(json.dumps(header, sort_keys=True, separators=(",", ":")).encode())
    for name in FIELDS:
        digest.update(_canonical(snapshot.arrays[name]))
    for name in BENCHMARK_FIELDS:
        digest.update(_canonical(snapshot.benchmark[name]))
    return digest.hexdigest()


def serialize(snapshot: Snapshot) -> bytes:
    buffer = io.BytesIO()
    payload = {f"a_{name}": snapshot.arrays[name] for name in FIELDS}
    payload |= {f"b_{name}": snapshot.benchmark[name] for name in BENCHMARK_FIELDS}
    header = {
        "meta": snapshot.meta,
        "symbols": list(snapshot.symbols),
        "dates": [day.isoformat() for day in snapshot.dates],
    }
    payload["header"] = np.frombuffer(json.dumps(header, separators=(",", ":")).encode(), dtype=np.uint8)
    np.savez_compressed(buffer, **payload)
    return buffer.getvalue()


def deserialize(blob: bytes) -> Snapshot:
    """Load and verify: the recomputed version must match the stored one."""
    with np.load(io.BytesIO(blob), allow_pickle=False) as data:
        header = json.loads(bytes(data["header"]).decode())
        arrays = {name: data[f"a_{name}"] for name in FIELDS}
        benchmark = {name: data[f"b_{name}"] for name in BENCHMARK_FIELDS}
    meta = header["meta"]
    snapshot = Snapshot(
        version=meta["version"],
        universe=meta["universe"],
        symbols=tuple(header["symbols"]),
        dates=tuple(date.fromisoformat(day) for day in header["dates"]),
        arrays=_freeze(arrays),
        benchmark_symbol=meta["benchmarkSymbol"],
        benchmark=_freeze(benchmark),
        meta=meta,
    )
    if compute_version(snapshot) != snapshot.version:
        raise SnapshotError("Snapshot failed verification (content doesn't match its version)")
    return snapshot


def public_meta(meta: Dict[str, Any], *, with_coverage: bool = False) -> Dict[str, Any]:
    keys = ("version", "universe", "benchmarkSymbol", "source", "downloadedAt", "survivorshipBiased", "caveats", "period", "symbolCount", "excludedDates", "benchmarkCoverage", "coverageSummary", "conventions", "storedAt", "sizeBytes")
    out = {key: meta[key] for key in keys if key in meta}
    if with_coverage:
        out["coverage"] = meta.get("coverage", [])
    return out


# ---------------------------------------------------------------------------------------------
# Loading through the store, with a small per-process cache (snapshots are immutable)

_CACHE: "OrderedDict[str, Snapshot]" = OrderedDict()
_CACHE_SIZE = 2


async def load_snapshot(store: Any, version: str) -> Optional[Snapshot]:
    import asyncio

    cached = _CACHE.get(version)
    if cached is not None:
        _CACHE.move_to_end(version)
        return cached
    blob = await store.get_research_dataset_blob(version)
    if blob is None:
        return None
    snapshot = await asyncio.to_thread(deserialize, blob)
    _CACHE[version] = snapshot
    while len(_CACHE) > _CACHE_SIZE:
        _CACHE.popitem(last=False)
    return snapshot


async def save_snapshot(store: Any, snapshot: Snapshot) -> Dict[str, Any]:
    """Idempotent: the same content always lands on the same version."""
    existing = await store.get_research_dataset(snapshot.version)
    if existing is not None:
        return existing
    return await store.add_research_dataset(dict(snapshot.meta), serialize(snapshot))


def clear_cache() -> None:
    _CACHE.clear()
