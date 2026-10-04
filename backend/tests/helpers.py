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
