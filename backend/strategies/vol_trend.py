"""Volatility-managed trend following (long only, no leverage).

Per stock, the trend signal is the share of trailing horizons (21, 63, 126, 252 sessions) over
which its dividend-adjusted return is positive: 0, 25, 50, 75 or 100% of a full position.
Negative trends move the position toward cash; nothing is shorted.

Sizing `vol_target`: each position starts at signal / trailing volatility (calmer stocks get more
weight), then the whole book is scaled so its volatility estimated from the trailing covariance
of daily returns equals targetVol — capped at maxWeight per stock and 100% gross, so in volatile
markets the book holds cash. `fixed` gives every stock 1/N times its signal. Running both
separates the signal from the sizing effect. The target is an estimate from past returns, not a
guarantee of realised volatility.
"""

from __future__ import annotations

from typing import Dict, Literal, Tuple

import numpy as np
from pydantic import Field

from backend.research.snapshots import SnapshotView
from backend.services.portfolio_engine import Decision
from backend.strategies.base import StrategyParams
from backend.strategies.portfolio_base import DecisionContext, PortfolioStrategy, register_portfolio, trailing_return, trailing_volatility

HORIZONS: Tuple[int, ...] = (21, 63, 126, 252)


class VolTrendParams(StrategyParams):
    sizing: Literal["vol_target", "fixed"] = Field(default="vol_target", title="Sizing", description="Volatility-targeted, or fixed 1/N per stock (for comparison).")
    targetVol: float = Field(default=0.15, ge=0.03, le=0.5, title="Target volatility (annual)", description="Portfolio-level target as a fraction (0.15 = 15%); an estimate, not a guarantee.")
    volWindow: int = Field(default=63, ge=20, le=252, title="Volatility window (sessions)", description="Trailing window for each stock's volatility.")
    maxWeight: float = Field(default=0.2, gt=0, le=1, title="Max weight per stock", description="Single-name cap as a fraction of equity.")
    rebalance: Literal["weekly", "monthly"] = Field(default="weekly", title="Rebalance", description="Decision at the last session of each week (or month).")


class VolTrend(PortfolioStrategy):
    id = "vol-trend"
    name = "Volatility-managed trend following"
    description = "Long while a stock trends up across several horizons, sized by its trailing volatility; falling trends move toward cash. No shorting or leverage."
    params_model = VolTrendParams
    data_requirements = "Daily dividend-adjusted closes; 253 sessions for the longest trend horizon plus the volatility window."
    holding_horizon = "Weeks to months; positions shrink as fewer horizons stay positive."
    risk_controls = ["Long only, gross exposure at most 100%.", "Volatility-scaled position sizes.", "Single-name cap.", "No-trade band on small weight changes."]
    default_tolerance = 0.02
    caveats = ["Volatility targeting uses past volatility; realised volatility will differ.", "Trend rules lag turning points by design."]

    def warmup_sessions(self, params: VolTrendParams) -> int:  # type: ignore[override]
        return max(HORIZONS) + 1

    def rebalance(self, params: VolTrendParams) -> str:  # type: ignore[override]
        return params.rebalance

    def decide(self, view: SnapshotView, context: DecisionContext, params: VolTrendParams) -> Decision:  # type: ignore[override]
        t = view.end
        adj = view.field("adj_close")
        symbols = view.symbols
        signs = np.vstack([np.sign(trailing_return(adj, t, horizon)) for horizon in HORIZONS])
        complete = np.isfinite(signs).all(axis=0)
        strength = np.where(complete, (signs > 0).mean(axis=0), np.nan)  # share of horizons with a positive return
        vol = trailing_volatility(adj, t, params.volWindow)
        ok = context.eligible & complete & np.isfinite(vol) & (vol > 0)
        n = int(ok.sum())
        day = view.dates[-1].isoformat()
        weights: Dict[str, float] = {}
        reasons: Dict[str, str] = {}
        previous = {symbol for symbol, weight in (context.previous.weights.items() if context.previous else []) if weight > 0}
        if n == 0:
            return Decision(weights={}, reasons={symbol: f"No stock had {max(HORIZONS) + 1} sessions of history and a volatility estimate at the {day} close." for symbol in previous})
        active = [j for j in np.flatnonzero(ok) if float(strength[j]) > 0]
        estimate = None
        if params.sizing == "vol_target" and active:
            raw = np.array([float(strength[j]) / float(vol[j]) for j in active])
            estimate = portfolio_volatility(adj, t, params.volWindow, active, raw)
            k = params.targetVol / estimate if estimate and estimate > 0 else 0.0
            for j, value in zip(active, raw):
                weights[symbols[j]] = min(params.maxWeight, k * value)
        else:
            for j in active:
                weights[symbols[j]] = float(strength[j]) * min(params.maxWeight, 1 / n)
        gross = sum(weights.values())
        scale = 1.0 / gross if gross > 1.0 else 1.0
        weights = {symbol: value * scale for symbol, value in weights.items() if value > 0}
        index = {symbol: j for j, symbol in enumerate(symbols)}
        for symbol, weight in weights.items():
            j = index[symbol]
            up = int(round(float(strength[j]) * len(HORIZONS)))
            sizing = f"own volatility {float(vol[j]):.0%}, book scaled to a {params.targetVol:.0%} estimate" if params.sizing == "vol_target" else f"fixed 1/{n}"
            reasons[symbol] = f"Up over {up} of {len(HORIZONS)} horizons at the {day} close; {sizing} → weight {weight:.1%}{' (scaled to 100% gross)' if scale < 1 else ''}."
        for symbol in previous - set(weights):
            j = index[symbol]
            reasons[symbol] = (
                f"Trend turned down over all horizons at the {day} close." if ok[j] else f"No longer eligible at the {day} close (liquidity, history or no trade that session)."
            )
        return Decision(weights=weights, reasons=reasons)


def portfolio_volatility(adj: np.ndarray, t: int, window: int, columns, weights: np.ndarray) -> float:
    """Annualised volatility of a weighted book from the trailing covariance of daily returns (data <= t)."""
    block = adj[max(0, t - window) : t + 1][:, columns]
    with np.errstate(divide="ignore", invalid="ignore"):
        returns = block[1:] / block[:-1] - 1
    returns = np.where(np.isfinite(returns), returns, np.nan)
    means = np.nanmean(returns, axis=0) if len(returns) else np.zeros(len(columns))
    centred = np.nan_to_num(returns - means, nan=0.0)  # missing days contribute nothing
    if len(centred) < 2:
        return 0.0
    covariance = centred.T @ centred / (len(centred) - 1)
    variance = float(weights @ covariance @ weights)
    return float(np.sqrt(max(variance, 0.0)) * np.sqrt(252))


register_portfolio(VolTrend())
