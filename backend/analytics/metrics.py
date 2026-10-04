"""Pure risk/performance metric functions.

Definitions follow the project's quant conventions exactly:
- Returns come from the (post-cost) equity curve, never raw prices.
- Sharpe  = mean(r - rf_p) / std(r) * sqrt(ppy)
- Sortino = mean(r - rf_p) / std(negative r) * sqrt(ppy)
- Max drawdown = min(equity / running_peak - 1), reported as a positive magnitude + duration
- CAGR = (end / start) ** (ppy / n_periods) - 1
- Win rate / profit factor from the closed-trade log
- Beta / alpha: OLS of strategy period returns on benchmark period returns, identical dates

Every metric returns (value, reason): value is None with a human-readable reason whenever it
can't be computed honestly (too little data, flat series, no trades). NaN/inf never escape.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

# Annualization: periods per year by bar interval. The only place these constants live.
PERIODS_PER_YEAR: Dict[str, int] = {"1d": 252, "1wk": 52, "1mo": 12}
MIN_OBSERVATIONS = 20

Metric = Tuple[Optional[float], Optional[str]]


def _finite(value: Any) -> Optional[float]:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def period_rate(annual_rate: float, periods_per_year: int) -> float:
    return (1 + annual_rate) ** (1 / periods_per_year) - 1


def period_returns(equity: pd.Series) -> pd.Series:
    return equity.pct_change().dropna()


def total_return(equity: pd.Series) -> Metric:
    if len(equity) < 2 or equity.iloc[0] <= 0:
        return None, "Needs at least two positive equity values"
    return _finite(equity.iloc[-1] / equity.iloc[0] - 1), None


def cagr(equity: pd.Series, periods_per_year: int) -> Metric:
    periods = len(equity) - 1
    if periods < 1:
        return None, "Needs at least two bars"
    start, end = float(equity.iloc[0]), float(equity.iloc[-1])
    if start <= 0 or end <= 0:
        return None, "Equity must stay positive"
    return _finite((end / start) ** (periods_per_year / periods) - 1), None


def volatility(returns: pd.Series, periods_per_year: int) -> Metric:
    if len(returns) < MIN_OBSERVATIONS:
        return None, f"Needs at least {MIN_OBSERVATIONS} return observations"
    return _finite(returns.std(ddof=1) * math.sqrt(periods_per_year)), None


def sharpe(returns: pd.Series, periods_per_year: int, risk_free_annual: float = 0.0) -> Metric:
    if len(returns) < MIN_OBSERVATIONS:
        return None, f"Needs at least {MIN_OBSERVATIONS} return observations"
    std = returns.std(ddof=1)
    if not std or not math.isfinite(std) or std < 1e-12:
        return None, "Equity never moved, so risk-adjusted return is undefined"
    excess = returns - period_rate(risk_free_annual, periods_per_year)
    return _finite(excess.mean() / std * math.sqrt(periods_per_year)), None


def sortino(returns: pd.Series, periods_per_year: int, risk_free_annual: float = 0.0) -> Metric:
    if len(returns) < MIN_OBSERVATIONS:
        return None, f"Needs at least {MIN_OBSERVATIONS} return observations"
    negative = returns[returns < 0]
    if len(negative) < 2:
        return None, "Too few losing periods to measure downside risk"
    downside = negative.std(ddof=1)
    if not downside or downside < 1e-12:
        return None, "Downside returns don't vary, so downside risk is undefined"
    excess = returns - period_rate(risk_free_annual, periods_per_year)
    return _finite(excess.mean() / downside * math.sqrt(periods_per_year)), None


def drawdown_profile(equity: pd.Series) -> Dict[str, Any]:
    """Worst peak-to-trough decline with its dates and duration (peak → recovery, or → end)."""
    if len(equity) < 2:
        return {"maxDrawdown": None, "reason": "Needs at least two bars"}
    running_peak = equity.cummax()
    drawdown = equity / running_peak - 1
    trough_pos = int(np.argmin(drawdown.to_numpy()))
    magnitude = -float(drawdown.iloc[trough_pos])
    if magnitude <= 0:
        return {"maxDrawdown": 0.0, "peak": None, "trough": None, "recovery": None, "durationBars": 0, "recovered": True}
    peak_value = running_peak.iloc[trough_pos]
    peak_pos = int(np.flatnonzero(equity.iloc[: trough_pos + 1].to_numpy() >= peak_value)[-1])
    after = equity.iloc[trough_pos:]
    recovered_mask = after.to_numpy() >= peak_value
    recovery_pos = trough_pos + int(np.flatnonzero(recovered_mask)[0]) if recovered_mask.any() else None
    end_pos = recovery_pos if recovery_pos is not None else len(equity) - 1
    return {
        "maxDrawdown": magnitude,
        "peak": equity.index[peak_pos].isoformat(),
        "trough": equity.index[trough_pos].isoformat(),
        "recovery": equity.index[recovery_pos].isoformat() if recovery_pos is not None else None,
        "durationBars": end_pos - peak_pos,
        "recovered": recovery_pos is not None,
    }


def win_rate(trades: Sequence[Dict[str, Any]]) -> Metric:
    closed = [trade for trade in trades if not trade.get("open")]
    if not closed:
        return None, "No closed trades"
    return sum(1 for trade in closed if trade["pnl"] > 0) / len(closed), None


def profit_factor(trades: Sequence[Dict[str, Any]]) -> Metric:
    closed = [trade for trade in trades if not trade.get("open")]
    if not closed:
        return None, "No closed trades"
    gains = sum(trade["pnl"] for trade in closed if trade["pnl"] > 0)
    losses = -sum(trade["pnl"] for trade in closed if trade["pnl"] < 0)
    if losses <= 0:
        return None, "No losing trades, so the ratio is unbounded"
    return _finite(gains / losses), None


def beta_alpha(
    strategy_returns: pd.Series,
    benchmark_returns: pd.Series,
    periods_per_year: int,
    risk_free_annual: float = 0.0,
) -> Dict[str, Metric]:
    joined = pd.concat([strategy_returns.rename("s"), benchmark_returns.rename("b")], axis=1, join="inner").dropna()
    unavailable = (None, f"Needs at least {MIN_OBSERVATIONS} overlapping return observations")
    if len(joined) < MIN_OBSERVATIONS:
        return {"beta": unavailable, "alpha": unavailable, "correlation": unavailable}
    variance = joined["b"].var(ddof=1)
    if not variance or variance < 1e-18:
        flat = (None, "Benchmark didn't move")
        return {"beta": flat, "alpha": flat, "correlation": flat}
    beta_value = joined["s"].cov(joined["b"]) / variance
    rf = period_rate(risk_free_annual, periods_per_year)
    alpha_period = (joined["s"] - rf).mean() - beta_value * (joined["b"] - rf).mean()
    strategy_moved = joined["s"].std(ddof=1) > 1e-18
    correlation = joined["s"].corr(joined["b"]) if strategy_moved else None  # avoids a 0/0 warning on flat equity
    return {
        "beta": (_finite(beta_value), None),
        "alpha": (_finite(alpha_period * periods_per_year), None),
        "correlation": (_finite(correlation), None) if _finite(correlation) is not None else (None, "Strategy equity never moved"),
    }


def split(metrics: Dict[str, Metric]) -> Tuple[Dict[str, Optional[float]], Dict[str, str]]:
    """{name: (value, reason)} -> ({name: value}, {name: reason for the missing ones})."""
    values = {name: _finite(value) for name, (value, _) in metrics.items()}
    reasons = {name: reason for name, (value, reason) in metrics.items() if _finite(value) is None and reason}
    return values, reasons


def sanitize(obj: Any) -> Any:
    """Recursively replace NaN/inf with None so nothing invalid reaches JSON."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {key: sanitize(value) for key, value in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize(value) for value in obj]
    if isinstance(obj, (np.floating,)):
        return sanitize(float(obj))
    if isinstance(obj, (np.integer,)):
        return int(obj)
    return obj


def series_metrics(equity: pd.Series, periods_per_year: int, risk_free_annual: float) -> Tuple[Dict[str, Optional[float]], Dict[str, str]]:
    """The standard set of curve-level metrics for any equity / price series."""
    returns = period_returns(equity)
    profile = drawdown_profile(equity)
    metrics: Dict[str, Metric] = {
        "totalReturn": total_return(equity),
        "cagr": cagr(equity, periods_per_year),
        "volatility": volatility(returns, periods_per_year),
        "sharpe": sharpe(returns, periods_per_year, risk_free_annual),
        "sortino": sortino(returns, periods_per_year, risk_free_annual),
        "maxDrawdown": (profile.get("maxDrawdown"), profile.get("reason")),
    }
    return split(metrics)


__all__: List[str] = [
    "PERIODS_PER_YEAR",
    "MIN_OBSERVATIONS",
    "beta_alpha",
    "cagr",
    "drawdown_profile",
    "period_returns",
    "profit_factor",
    "sanitize",
    "series_metrics",
    "sharpe",
    "sortino",
    "total_return",
    "volatility",
    "win_rate",
]
