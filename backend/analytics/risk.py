"""Risk report assembly: strategy vs buy-and-hold vs benchmark over identical dates."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import pandas as pd

from backend.analytics.metrics import (
    PERIODS_PER_YEAR,
    beta_alpha,
    drawdown_profile,
    period_returns,
    profit_factor,
    sanitize,
    series_metrics,
    split,
    win_rate,
)


def default_benchmark(symbol: str) -> str:
    """Broad-market index for the listing's market (US default)."""
    upper = symbol.upper()
    if upper.endswith(".NS") or upper.endswith(".BO"):
        return "^NSEI"
    if upper.endswith(".L"):
        return "^FTSE"
    return "SPY"


def build_risk_report(
    equity: pd.Series,
    buy_hold_equity: pd.Series,
    trades: List[Dict[str, Any]],
    benchmark_symbol: str,
    benchmark_close: Optional[pd.Series],
    benchmark_source: Optional[str],
    risk_free_annual: float = 0.0,
    interval: str = "1d",
) -> Dict[str, Any]:
    ppy = PERIODS_PER_YEAR[interval]
    strategy_values, strategy_reasons = series_metrics(equity, ppy, risk_free_annual)
    trade_values, trade_reasons = split({"winRate": win_rate(trades), "profitFactor": profit_factor(trades)})
    profile = drawdown_profile(equity)
    buy_hold_values, buy_hold_reasons = series_metrics(buy_hold_equity, ppy, risk_free_annual)

    benchmark: Dict[str, Any] = {"symbol": benchmark_symbol, "source": benchmark_source, "available": False}
    comparison: Dict[str, Any] = {}
    comparison_reasons: Dict[str, str] = {}
    benchmark_equity: List[Dict[str, Any]] = []

    if benchmark_close is not None and len(benchmark_close) > 1:
        # Identical window: keep only dates both series have (compare by calendar day; bar
        # timestamps for different exchanges can differ by hours).
        strat_by_day = equity.copy()
        strat_by_day.index = strat_by_day.index.normalize()
        bench_by_day = benchmark_close.copy()
        bench_by_day.index = bench_by_day.index.normalize()
        bench_by_day = bench_by_day[~bench_by_day.index.duplicated(keep="last")]
        strat_by_day = strat_by_day[~strat_by_day.index.duplicated(keep="last")]
        common = strat_by_day.index.intersection(bench_by_day.index)
        if len(common) > 1:
            strat_aligned = strat_by_day.loc[common]
            bench_aligned = bench_by_day.loc[common]
            bench_values, bench_reasons = series_metrics(bench_aligned, ppy, risk_free_annual)
            relation = beta_alpha(period_returns(strat_aligned), period_returns(bench_aligned), ppy, risk_free_annual)
            relation_values, relation_reasons = split(relation)
            strat_total = strat_aligned.iloc[-1] / strat_aligned.iloc[0] - 1
            bench_total = bench_values.get("totalReturn")
            benchmark = {
                "symbol": benchmark_symbol,
                "source": benchmark_source,
                "available": True,
                "overlapBars": len(common),
                "metrics": bench_values,
                "unavailable": bench_reasons,
            }
            comparison = relation_values | {"excessReturn": (strat_total - bench_total) if bench_total is not None else None}
            comparison_reasons = relation_reasons
            scale = float(equity.iloc[0]) / float(bench_aligned.iloc[0])
            benchmark_equity = [{"timestamp": ts.isoformat(), "value": float(value * scale)} for ts, value in bench_aligned.items()]
        else:
            benchmark["reason"] = "No overlapping dates with the benchmark"
    else:
        benchmark["reason"] = "Benchmark history unavailable"

    if benchmark.get("available") and benchmark_source and benchmark_source != "live":
        benchmark["reason"] = f"Benchmark used {benchmark_source} fallback data"

    report = {
        "periodsPerYear": ppy,
        "riskFreeRate": risk_free_annual,
        "metrics": strategy_values | trade_values,
        "unavailable": strategy_reasons | trade_reasons,
        "drawdown": profile,
        "buyHold": {"metrics": buy_hold_values, "unavailable": buy_hold_reasons},
        "benchmark": benchmark,
        "comparison": comparison,
        "comparisonUnavailable": comparison_reasons,
        "benchmarkEquity": benchmark_equity,
    }
    return sanitize(report)
