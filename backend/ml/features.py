"""Leakage-free feature generators over daily OHLCV bars.

Every feature at row t uses only data up to and including bar t: rolling windows and
exponential averages look backward, shifts are positive. A feature config is a plain,
serializable dict {feature_name: {param: value}} so models can store exactly what they used.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List

import numpy as np
import pandas as pd

FeatureFn = Callable[..., pd.DataFrame]


@dataclass(frozen=True)
class FeatureSpec:
    name: str
    description: str
    defaults: Dict[str, Any]
    fn: FeatureFn
    group: str


def _returns(bars: pd.DataFrame) -> pd.Series:
    return bars["close"].pct_change()


def f_returns(bars: pd.DataFrame) -> pd.DataFrame:
    close = bars["close"]
    return pd.DataFrame({"ret_1d": close.pct_change(), "log_ret_1d": np.log(close / close.shift(1))}, index=bars.index)


def f_lagged_returns(bars: pd.DataFrame, lags: List[int]) -> pd.DataFrame:
    ret = _returns(bars)
    return pd.DataFrame({f"ret_lag_{lag}": ret.shift(lag) for lag in lags}, index=bars.index)


def f_volatility(bars: pd.DataFrame, windows: List[int]) -> pd.DataFrame:
    ret = _returns(bars)
    return pd.DataFrame({f"vol_{w}d": ret.rolling(w, min_periods=w).std(ddof=1) for w in windows}, index=bars.index)


def f_rsi(bars: pd.DataFrame, period: int) -> pd.DataFrame:
    delta = bars["close"].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    # Wilder smoothing (alpha = 1/period), backward-looking; NaN until `period` observations exist.
    avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - 100 / (1 + rs)
    rsi = rsi.where(avg_loss != 0, 100.0).where(avg_gain.notna())
    return pd.DataFrame({f"rsi_{period}": rsi}, index=bars.index)


def f_macd(bars: pd.DataFrame, fast: int, slow: int, signal: int) -> pd.DataFrame:
    close = bars["close"]
    ema_fast = close.ewm(span=fast, adjust=False, min_periods=fast).mean()
    ema_slow = close.ewm(span=slow, adjust=False, min_periods=slow).mean()
    macd = ema_fast - ema_slow
    macd_signal = macd.ewm(span=signal, adjust=False, min_periods=signal).mean()
    # Scale by price so the feature is comparable across symbols and price levels.
    return pd.DataFrame(
        {"macd": macd / close, "macd_signal": macd_signal / close, "macd_hist": (macd - macd_signal) / close},
        index=bars.index,
    )


def f_bollinger(bars: pd.DataFrame, window: int, num_std: float) -> pd.DataFrame:
    close = bars["close"]
    mid = close.rolling(window, min_periods=window).mean()
    std = close.rolling(window, min_periods=window).std(ddof=0)
    width = (num_std * std).replace(0, np.nan)
    return pd.DataFrame({f"bb_pos_{window}": (close - mid) / width}, index=bars.index)


def f_ma_ratios(bars: pd.DataFrame, windows: List[int]) -> pd.DataFrame:
    close = bars["close"]
    columns: Dict[str, pd.Series] = {}
    for w in windows:
        columns[f"close_sma_{w}"] = close / close.rolling(w, min_periods=w).mean() - 1
        columns[f"close_ema_{w}"] = close / close.ewm(span=w, adjust=False, min_periods=w).mean() - 1
    return pd.DataFrame(columns, index=bars.index)


def f_volume(bars: pd.DataFrame, window: int) -> pd.DataFrame:
    if "volume" not in bars or bars["volume"].isna().all():
        return pd.DataFrame(index=bars.index)
    volume = bars["volume"].astype(float).replace(0, np.nan)
    return pd.DataFrame(
        {"volume_chg_1d": volume.pct_change(), f"volume_vs_sma_{window}": volume / volume.rolling(window, min_periods=window).mean() - 1},
        index=bars.index,
    )


def f_momentum(bars: pd.DataFrame, windows: List[int]) -> pd.DataFrame:
    close = bars["close"]
    return pd.DataFrame({f"mom_{w}d": close / close.shift(w) - 1 for w in windows}, index=bars.index)


FEATURES: Dict[str, FeatureSpec] = {
    spec.name: spec
    for spec in [
        FeatureSpec("returns", "Simple and log return over the last bar.", {}, f_returns, "Returns"),
        FeatureSpec("lagged_returns", "Daily return k bars ago, for several lags.", {"lags": [1, 2, 3, 5, 10]}, f_lagged_returns, "Returns"),
        FeatureSpec("volatility", "Rolling standard deviation of daily returns.", {"windows": [10, 20]}, f_volatility, "Risk"),
        FeatureSpec("rsi", "Relative Strength Index with Wilder smoothing (0–100).", {"period": 14}, f_rsi, "Oscillators"),
        FeatureSpec("macd", "MACD line, signal, and histogram, scaled by price.", {"fast": 12, "slow": 26, "signal": 9}, f_macd, "Trend"),
        FeatureSpec("bollinger", "Price position inside the Bollinger bands (−1 lower band, +1 upper band).", {"window": 20, "num_std": 2.0}, f_bollinger, "Oscillators"),
        FeatureSpec("ma_ratios", "Close relative to simple and exponential moving averages.", {"windows": [10, 20, 50]}, f_ma_ratios, "Trend"),
        FeatureSpec("volume", "Daily volume change and volume relative to its moving average.", {"window": 20}, f_volume, "Volume"),
        FeatureSpec("momentum", "Return over several lookback windows.", {"windows": [5, 10, 20]}, f_momentum, "Trend"),
    ]
}

DEFAULT_FEATURE_CONFIG: Dict[str, Dict[str, Any]] = {name: dict(spec.defaults) for name, spec in FEATURES.items()}


def resolve_config(selected: Dict[str, Dict[str, Any]] | List[str] | None) -> Dict[str, Dict[str, Any]]:
    """Normalize a selection (names or {name: params}) into a full, validated config."""
    if selected is None:
        return {name: dict(params) for name, params in DEFAULT_FEATURE_CONFIG.items()}
    if isinstance(selected, list):
        selected = {name: {} for name in selected}
    config: Dict[str, Dict[str, Any]] = {}
    for name, overrides in selected.items():
        if name not in FEATURES:
            raise ValueError(f"Unknown feature: {name}")
        unknown = set(overrides) - set(FEATURES[name].defaults)
        if unknown:
            raise ValueError(f"Unknown parameter(s) for {name}: {', '.join(sorted(unknown))}")
        config[name] = dict(FEATURES[name].defaults) | dict(overrides)
    if not config:
        raise ValueError("Select at least one feature")
    return config


def build_features(bars: pd.DataFrame, config: Dict[str, Dict[str, Any]]) -> pd.DataFrame:
    frames = [FEATURES[name].fn(bars, **params) for name, params in config.items()]
    features = pd.concat(frames, axis=1)
    return features.replace([np.inf, -np.inf], np.nan)


def max_lookback(config: Dict[str, Dict[str, Any]]) -> int:
    """Rough warm-up length implied by a config (for 'not enough history' checks)."""
    longest = 1
    for params in config.values():
        for value in params.values():
            values = value if isinstance(value, list) else [value]
            for item in values:
                if isinstance(item, (int, float)) and not isinstance(item, bool):
                    longest = max(longest, int(item))
    return longest


def catalog() -> List[Dict[str, Any]]:
    return [{"name": s.name, "group": s.group, "description": s.description, "defaults": s.defaults} for s in FEATURES.values()]
