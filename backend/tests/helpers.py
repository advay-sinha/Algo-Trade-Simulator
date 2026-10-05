"""Deterministic synthetic market data for tests (no network)."""

from __future__ import annotations

import numpy as np
import pandas as pd


def make_bars(n: int = 400, seed: int = 11, start: str = "2023-01-02") -> pd.DataFrame:
    """Random-walk daily bars with drift and a cycle, UTC-indexed like real chart payloads."""
    rng = np.random.default_rng(seed)
    index = pd.date_range(start, periods=n, freq="B", tz="UTC")
    returns = rng.normal(0.0004, 0.013, n) + 0.004 * np.sin(np.arange(n) / 12)
    close = 100 * np.cumprod(1 + returns)
    open_ = close * (1 + rng.normal(0, 0.002, n))
    high = np.maximum(open_, close) * (1 + np.abs(rng.normal(0, 0.004, n)))
    low = np.minimum(open_, close) * (1 - np.abs(rng.normal(0, 0.004, n)))
    volume = rng.integers(1_000_000, 5_000_000, n).astype(float)
    return pd.DataFrame({"open": open_, "high": high, "low": low, "close": close, "volume": volume}, index=index)


def make_sine_bars(n: int = 300) -> pd.DataFrame:
    """Smooth trending sine wave: produces several clean moving-average crossovers."""
    index = pd.date_range("2024-01-01", periods=n, freq="B", tz="UTC")
    base = 100 + 0.05 * np.arange(n) + 8 * np.sin(np.arange(n) / 15)
    return pd.DataFrame({"open": base - 0.2, "high": base + 1, "low": base - 1, "close": base}, index=index)


def make_panel_frames(symbols=("AAA.NS", "BBB.NS", "CCC.NS", "DDD.NS"), n: int = 260, seed: int = 3, start: str = "2024-01-01"):
    """yfinance-shaped daily frames (auto_adjust=False, actions=True) for a small synthetic universe.

    Built-in quirks the research snapshot must handle: a holiday placeholder date (flat bar, zero
    volume for every symbol), a weekend special session, a late listing (last symbol starts at
    bar 60), a single-stock zero-volume day, and a dividend with a matching Adj Close.
    Returns (frames, benchmark_frame, info).
    """
    rng = np.random.default_rng(seed)
    days = pd.bdate_range(start, periods=n)
    holiday = days[100]
    weekend = days[150] - pd.Timedelta(days=days[150].weekday() + 2) + pd.Timedelta(days=7)  # a Saturday
    index = pd.DatetimeIndex(sorted(list(days) + [weekend])).tz_localize("Asia/Kolkata")
    frames = {}
    for k, symbol in enumerate(symbols):
        returns = rng.normal(0.0005 + 0.0003 * (k % 5), 0.012, len(index))
        close = 100 * (k % 7 + 1) * np.cumprod(1 + returns)
        open_ = close * (1 + rng.normal(0, 0.003, len(index)))
        volume = rng.integers(200_000, 900_000, len(index)).astype(float)
        frame = pd.DataFrame(
            {
                "Open": open_,
                "High": np.maximum(open_, close) * 1.004,
                "Low": np.minimum(open_, close) * 0.996,
                "Close": close,
                "Volume": volume,
                "Dividends": 0.0,
                "Stock Splits": 0.0,
            },
            index=index,
        )
        h = frame.index.get_loc(index[index.date == holiday.date()][0])
        frame.iloc[h, frame.columns.get_indexer(["Open", "High", "Low", "Close"])] = frame["Close"].iloc[h - 1]
        frame.iloc[h, frame.columns.get_loc("Volume")] = 0.0
        frame["Adj Close"] = frame["Close"]
        frames[symbol] = frame
    # Dividend on the first symbol at bar 120: Yahoo-style back-adjustment of Adj Close.
    first = frames[symbols[0]]
    ex = 120
    dividend = round(float(first["Close"].iloc[ex - 1]) * 0.02, 2)
    first.iloc[ex, first.columns.get_loc("Dividends")] = dividend
    factor = 1 - dividend / float(first["Close"].iloc[ex - 1])
    adj = first["Close"].to_numpy().copy()
    adj[:ex] *= factor
    first["Adj Close"] = adj
    # Single-stock zero-volume session on the second symbol.
    frames[symbols[1]].iloc[80, frames[symbols[1]].columns.get_loc("Volume")] = 0.0
    # Late listing.
    frames[symbols[-1]] = frames[symbols[-1]].iloc[60:].copy()
    bench_close = 1000 * np.cumprod(1 + rng.normal(0.0004, 0.009, len(index)))
    benchmark = pd.DataFrame({"Open": bench_close, "High": bench_close, "Low": bench_close, "Close": bench_close, "Adj Close": bench_close, "Volume": 0.0}, index=index).drop(index[[10]])
    info = {"holiday": holiday.date(), "weekend": weekend.date(), "dividendBar": ex, "dividend": dividend, "zeroVolumeBar": 80}
    return frames, benchmark, info
