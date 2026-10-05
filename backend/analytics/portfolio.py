"""Portfolio-level analytics on real holdings (pure functions; no I/O).

Conventions (see the quant-conventions skill):
- Weights come from current market value in INR.
- The return series is the portfolio *as held today*: current weights applied to aligned daily
  returns. It is not a reconstruction of past holdings.
- Ratios are fractions; anything that can't be computed honestly is None with a reason.
- Observations describe facts and never tell the user what to do.
"""

from __future__ import annotations

import math
from datetime import date
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

from backend.analytics.metrics import MIN_OBSERVATIONS, PERIODS_PER_YEAR, Metric, beta_alpha, drawdown_profile, series_metrics, split, tracking_error, value_at_risk

MIN_COVERAGE = 0.6  # an instrument needs prices on 60% of the window's trading days
MAX_CORRELATION_ITEMS = 12


def concentration(weights: pd.Series) -> Dict[str, Optional[float]]:
    clean = weights[weights > 0].sort_values(ascending=False)
    if clean.empty:
        return {"top1": None, "top5": None, "hhi": None, "effectiveHoldings": None}
    hhi = float((clean**2).sum())
    return {
        "top1": float(clean.iloc[0]),
        "top5": float(clean.iloc[:5].sum()),
        "hhi": hhi,
        "effectiveHoldings": 1 / hhi if hhi > 0 else None,
    }


def mix(weights: pd.Series, labels: pd.Series, unknown: str = "Unclassified") -> List[Dict[str, Any]]:
    frame = pd.DataFrame({"weight": weights, "label": labels.reindex(weights.index).fillna(unknown).replace("", unknown)})
    grouped = frame.groupby("label")["weight"].sum().sort_values(ascending=False)
    return [{"label": str(label), "weight": float(weight)} for label, weight in grouped.items()]


def align_prices(closes: Dict[str, pd.Series], window_days: int) -> Tuple[pd.DataFrame, List[Dict[str, str]]]:
    """Daily closes by calendar date; instruments with thin coverage are excluded with a reason."""
    by_day = {}
    for key, series in closes.items():
        if series is None or series.empty:
            continue
        # Callers index each series by its exchange-local trading date (naive), so NSE, US and fund
        # prices line up by calendar day.
        daily = series.copy()
        daily.index = pd.DatetimeIndex(daily.index).normalize()
        by_day[key] = daily[~daily.index.duplicated(keep="last")]
    excluded: List[Dict[str, str]] = [{"key": key, "reason": "No price history available"} for key, series in closes.items() if key not in by_day]
    if not by_day:
        return pd.DataFrame(), excluded
    frame = pd.DataFrame(by_day).sort_index()
    frame = frame[frame.index >= frame.index.max() - pd.Timedelta(days=window_days)]
    keep = []
    for key in frame.columns:
        coverage = frame[key].notna().mean()
        if coverage < MIN_COVERAGE:
            excluded.append({"key": key, "reason": f"Prices on only {coverage:.0%} of trading days in the window"})
        else:
            keep.append(key)
    # Carry the last price across a holiday on one exchange (at most 5 days), then require full rows.
    aligned = frame[keep].ffill(limit=5).dropna()
    return aligned, excluded


def weighted_returns(prices: pd.DataFrame, weights: pd.Series) -> pd.Series:
    """Daily returns of the current weights (renormalised over the instruments with history)."""
    if prices.empty:
        return pd.Series(dtype=float)
    usable = weights.reindex(prices.columns).fillna(0)
    total = usable.sum()
    if total <= 0:
        return pd.Series(dtype=float)
    returns = prices.pct_change().dropna(how="all").fillna(0)
    return returns.mul(usable / total, axis=1).sum(axis=1)


def risk_metrics(port_returns: pd.Series, bench_returns: Optional[pd.Series], confidence: float) -> Tuple[Dict[str, Optional[float]], Dict[str, str]]:
    ppy = PERIODS_PER_YEAR["1d"]
    if len(port_returns) < 2:
        reason = "Not enough overlapping price history"
        names = ["totalReturn", "volatility", "sharpe", "sortino", "maxDrawdown", "var", "cvar", "beta", "trackingError", "correlation"]
        return {name: None for name in names}, {name: reason for name in names}
    equity = (1 + port_returns).cumprod()
    values, reasons = series_metrics(equity, ppy, 0.0)
    values.pop("cagr", None)
    reasons.pop("cagr", None)
    var_values, var_reasons = split(value_at_risk(port_returns, confidence))
    values |= var_values
    reasons |= var_reasons
    if bench_returns is not None and len(bench_returns) > 1:
        relation_values, relation_reasons = split(beta_alpha(port_returns, bench_returns, ppy))
        relation_values.pop("alpha", None)
        relation_reasons.pop("alpha", None)
        values |= relation_values
        reasons |= relation_reasons
        te, te_reason = tracking_error(port_returns, bench_returns, ppy)
        values["trackingError"] = te
        if te_reason:
            reasons["trackingError"] = te_reason
    else:
        for name in ("beta", "correlation", "trackingError"):
            values[name] = None
            reasons[name] = "Benchmark prices unavailable"
    return values, reasons


def instrument_betas(prices: pd.DataFrame, bench_returns: Optional[pd.Series]) -> Dict[str, Optional[float]]:
    if bench_returns is None or prices.empty:
        return {key: None for key in prices.columns}
    returns = prices.pct_change().dropna(how="all")
    out: Dict[str, Optional[float]] = {}
    for key in returns.columns:
        value, _ = beta_alpha(returns[key].dropna(), bench_returns, PERIODS_PER_YEAR["1d"])["beta"]
        out[key] = value
    return out


def correlation_matrix(prices: pd.DataFrame, weights: pd.Series, limit: int = MAX_CORRELATION_ITEMS) -> Dict[str, Any]:
    if prices.shape[1] < 2:
        return {"keys": [], "matrix": [], "reason": "Needs at least two holdings with price history"}
    top = weights.reindex(prices.columns).fillna(0).sort_values(ascending=False).index[:limit]
    returns = prices[list(top)].pct_change().dropna()
    if len(returns) < MIN_OBSERVATIONS:
        return {"keys": [], "matrix": [], "reason": f"Needs at least {MIN_OBSERVATIONS} overlapping days"}
    corr = returns.corr().round(4)
    matrix = [[None if not math.isfinite(v) else float(v) for v in row] for row in corr.to_numpy()]
    return {"keys": [str(key) for key in corr.columns], "matrix": matrix, "reason": None}


def xirr(cashflows: Sequence[Tuple[date, float]]) -> Metric:
    """Money-weighted annual return: the rate where the dated cash flows' NPV is zero."""
    flows = sorted((day, amount) for day, amount in cashflows if amount)
    if len(flows) < 2 or not any(amount < 0 for _, amount in flows) or not any(amount > 0 for _, amount in flows):
        return None, "Needs purchase dates and costs for at least one holding"
    start = flows[0][0]
    years = [((day - start).days) / 365.0 for day, _ in flows]
    if max(years) <= 0:
        return None, "All cash flows fall on the same day"

    def npv(rate: float) -> float:
        return sum(amount / (1 + rate) ** t for (_, amount), t in zip(flows, years))

    low, high = -0.9999, 10.0
    f_low, f_high = npv(low), npv(high)
    if f_low * f_high > 0:
        return None, "No annual rate fits these cash flows"
    for _ in range(200):
        mid = (low + high) / 2
        f_mid = npv(mid)
        if abs(f_mid) < 1e-7:
            break
        if f_low * f_mid < 0:
            high, f_high = mid, f_mid
        else:
            low, f_low = mid, f_mid
    return float((low + high) / 2), None


def apply_what_if(weights: pd.Series, cap: Optional[Tuple[str, float]] = None, remove: Iterable[str] = ()) -> pd.Series:
    """User-chosen scenario: drop holdings, and/or cap one holding's weight; the rest scale up pro rata."""
    adjusted = weights.drop(labels=[key for key in remove if key in weights.index]).astype(float)
    if adjusted.sum() <= 0:
        return adjusted
    adjusted = adjusted / adjusted.sum()
    if cap is not None and cap[0] in adjusted.index:
        key, limit = cap
        if adjusted[key] > limit:
            excess = adjusted[key] - limit
            others = adjusted.drop(key)
            adjusted[key] = limit
            if others.sum() > 0:
                adjusted[others.index] = others + excess * others / others.sum()
    return adjusted


def stress_loss(weights: pd.Series, *, shock: float, kind: str, betas: Optional[Dict[str, Optional[float]]] = None, sectors: Optional[pd.Series] = None, sector: Optional[str] = None) -> Dict[str, Any]:
    """Estimated portfolio change for a user-picked shock (negative = loss), as a fraction of value."""
    if kind == "market":
        contributions = {}
        missing = []
        for key, weight in weights.items():
            beta = (betas or {}).get(key)
            if beta is None:
                missing.append(key)
                beta = 1.0  # no history: assume it moves with the market, and say so
            contributions[key] = float(weight) * beta * shock
        return {"change": sum(contributions.values()), "assumedBetaOne": missing, "byHolding": contributions}
    if kind == "sector" and sectors is not None:
        hit = sectors.reindex(weights.index) == sector
        contributions = {key: float(weights[key]) * shock for key in weights.index if bool(hit.get(key))}
        return {"change": sum(contributions.values()), "assumedBetaOne": [], "byHolding": contributions}
    return {"change": None, "assumedBetaOne": [], "byHolding": {}}


def _pct(value: float) -> str:
    return f"{value * 100:.0f}%"


def observations(report: Dict[str, Any]) -> List[str]:
    """Plain statements of fact about the report. No instructions, no recommendations."""
    out: List[str] = []
    positions = report.get("positions") or []
    conc = report.get("concentration") or {}
    if positions and conc.get("top1") is not None:
        biggest = positions[0]
        out.append(f"The largest holding, {biggest['label']}, is {_pct(conc['top1'])} of the portfolio's value.")
        if len(positions) > 5 and conc.get("top5") is not None:
            out.append(f"The five largest holdings make up {_pct(conc['top5'])} of value.")
        if conc.get("effectiveHoldings"):
            out.append(f"By value weight the portfolio behaves like {conc['effectiveHoldings']:.1f} equally sized holdings (out of {len(positions)}).")
    sectors = [item for item in (report.get("sectorMix") or []) if item["label"] != "Unclassified"]
    if sectors:
        out.append(f"{sectors[0]['label']} is the largest sector at {_pct(sectors[0]['weight'])} of value.")
    risk = report.get("risk") or {}
    if risk.get("var") is not None:
        confidence = report.get("confidence", 0.95)
        out.append(f"On {_pct(1 - confidence)} of days in the window, the portfolio as held would have lost more than {risk['var'] * 100:.1f}% in a day.")
    if risk.get("beta") is not None and report.get("benchmark", {}).get("symbol"):
        direction = "the same" if risk["beta"] >= 0 else "the opposite"
        out.append(f"Its beta to {report['benchmark']['symbol']} is {risk['beta']:.2f}: a 1% index move has historically come with about a {abs(risk['beta']):.2f}% move in {direction} direction.")
    if risk.get("maxDrawdown") is not None:
        out.append(f"The deepest fall from a peak in the window was {_pct(risk['maxDrawdown'])}.")
    excluded = (report.get("coverage") or {}).get("excluded") or []
    if excluded:
        out.append(f"{len(excluded)} holding{'s' if len(excluded) != 1 else ''} had too little price history and {'are' if len(excluded) != 1 else 'is'} left out of the risk figures.")
    return out
