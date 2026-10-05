"""One-call research snapshot of a stock for investment questions in the copilot.

Everything is computed from daily bars up to the latest close: performance, risk, trend, RSI,
and the current signal of each built-in strategy at its default parameters (plus the user's
latest ML model signal when one exists). Signals describe the present state of simple rules,
not forecasts; the copilot presents them as research evidence with a disclaimer.

Units are explicit for the model: percentages end in `Pct`, prices are in the listing currency.
"""

from __future__ import annotations

import asyncio
import math
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from backend.analytics.metrics import PERIODS_PER_YEAR, beta_alpha, drawdown_profile, period_returns
from backend.analytics.risk import default_benchmark
from backend.services import market_data_service as market
from backend.services.backtesting_service import bars_from_points
from backend.strategies import REGISTRY

SIGNAL_STRATEGIES = ("sma-crossover", "momentum", "mean-reversion")
WINDOWS = {"1m": 21, "3m": 63, "6m": 126, "1y": 252}


def _pct(value: Optional[float], digits: int = 2) -> Optional[float]:
    if value is None or not math.isfinite(value):
        return None
    return round(value * 100, digits)


def _num(value: Optional[float], digits: int = 2) -> Optional[float]:
    if value is None or not math.isfinite(value):
        return None
    return round(float(value), digits)


def _rsi(close: pd.Series, period: int = 14) -> Optional[float]:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    if loss.iloc[-1] == 0:
        return 100.0
    value = 100 - 100 / (1 + gain.iloc[-1] / loss.iloc[-1])
    return _num(value, 1)


def _signal_reason(strategy_id: str, bars: pd.DataFrame, params: Any, long: bool) -> str:
    close = bars["close"]
    if strategy_id == "sma-crossover":
        short = close.rolling(params.shortWindow).mean().iloc[-1]
        long_ma = close.rolling(params.longWindow).mean().iloc[-1]
        relation = "above" if short > long_ma else "below"
        return f"{params.shortWindow}-day average ({short:.2f}) is {relation} the {params.longWindow}-day average ({long_ma:.2f})."
    if strategy_id == "momentum":
        trailing = close.iloc[-1] / close.iloc[-1 - params.lookback] - 1
        return f"Return over the last {params.lookback} sessions is {trailing:+.1%} (rule: long above {params.threshold:+.1%})."
    if strategy_id == "mean-reversion":
        mean = close.rolling(params.lookback).mean().iloc[-1]
        std = close.rolling(params.lookback).std(ddof=0).iloc[-1]
        z = (close.iloc[-1] - mean) / std if std else 0.0
        return f"Price is {z:+.2f} standard deviations from its {params.lookback}-day mean (rule: buy below {-params.entryZ:g}, exit at {params.exitZ:g})." + (" Holding a dip entry." if long else "")
    return "Rule signal."


def _strategy_signals(bars: pd.DataFrame) -> List[Dict[str, Any]]:
    out = []
    for strategy_id in SIGNAL_STRATEGIES:
        strategy = REGISTRY.get(strategy_id)
        if strategy is None:
            continue
        params = strategy.parse_params({})
        if len(bars) < strategy.min_history(params) + 2:
            out.append({"strategy": strategy.name, "signal": "not enough history", "reason": f"Needs {strategy.min_history(params)} sessions."})
            continue
        signals = strategy.generate_signals(bars, params)
        long = bool(signals.iloc[-1] == 1)
        changed_at = None
        flips = signals.ne(signals.shift()).to_numpy().nonzero()[0]
        if len(flips):
            changed_at = bars.index[flips[-1]].date().isoformat()
        out.append(
            {
                "strategy": strategy.name,
                "strategyId": strategy_id,
                "signal": "bullish (long)" if long else "neutral (flat)",
                "since": changed_at,
                "reason": _signal_reason(strategy_id, bars, params, long),
            }
        )
    return out


def _tilt(signals: List[Dict[str, Any]], trend: str, ml_signal: Optional[str]) -> Dict[str, Any]:
    votes = [s["signal"] for s in signals if s["signal"].startswith(("bullish", "neutral"))]
    positive = sum(1 for v in votes if v.startswith("bullish"))
    if trend.startswith("uptrend"):
        positive += 1
    total = len(votes) + 1
    if ml_signal is not None:
        total += 1
        positive += 1 if ml_signal.startswith("bullish") else 0
    share = positive / total if total else 0.0
    label = "leaning positive" if share >= 0.67 else "leaning negative" if share <= 0.33 else "mixed"
    return {"label": label, "positiveSignals": positive, "signalsCounted": total, "note": "A count of simple rule states today, not a forecast or a recommendation."}


async def analyze(symbol: str, store: Any = None, user_id: Optional[str] = None) -> Dict[str, Any]:
    symbol = symbol.upper()
    benchmark = default_benchmark(symbol)
    chart, bench_chart = await asyncio.gather(market.get_daily_history(symbol, "2y"), market.get_daily_history(benchmark, "2y"), return_exceptions=True)
    if isinstance(chart, BaseException):
        raise chart
    bars = bars_from_points(chart.get("points", []))
    if len(bars) < 30:
        return {"symbol": symbol, "available": False, "reason": "Not enough daily history for an analysis.", "dataSource": chart.get("source")}
    close = bars["close"]
    last = float(close.iloc[-1])
    year = close.iloc[-252:] if len(close) >= 252 else close
    returns = {f"return{key}Pct": _pct(close.iloc[-1] / close.iloc[-1 - n] - 1) if len(close) > n else None for key, n in WINDOWS.items()}
    daily = period_returns(year)
    ppy = PERIODS_PER_YEAR["1d"]
    profile = drawdown_profile(year)
    sma50 = close.rolling(50).mean().iloc[-1] if len(close) >= 50 else float("nan")
    sma200 = close.rolling(200).mean().iloc[-1] if len(close) >= 200 else float("nan")
    if math.isfinite(sma200):
        trend = "uptrend (price above its 200-day average)" if last > sma200 else "downtrend (price below its 200-day average)"
    else:
        trend = "unknown (under 200 sessions of history)"
    beta = None
    if not isinstance(bench_chart, BaseException):
        bench_bars = bars_from_points(bench_chart.get("points", []))
        if len(bench_bars) > 60:
            bench_year = bench_bars["close"].iloc[-252:]
            relation = beta_alpha(daily, period_returns(bench_year), ppy)
            beta = _num(relation["beta"][0])
    ml = None
    if store is not None and user_id:
        record = await store.latest_model(user_id, symbol)
        if record:
            from backend.services.research_actions import ActionError, model_signal_for_user

            try:
                result = await model_signal_for_user(store, record)
                ml = {
                    "model": record.get("modelName") or result.get("modelType"),
                    "trainedAt": result.get("trainedAt"),
                    "signal": "bullish (long)" if result.get("signal") == "buy" else "neutral (flat)",
                    "prediction": result.get("predictionName"),
                    "probabilitiesPct": {name: _pct(value, 1) for name, value in (result.get("probabilities") or {}).items()},
                    "asOf": result.get("asOf"),
                    "note": "Check the model's test accuracy against its baseline before trusting this signal.",
                }
            except ActionError:
                ml = None
    signals = _strategy_signals(bars)
    tilt = _tilt(signals, trend, (ml or {}).get("signal"))
    return {
        "symbol": symbol,
        "available": True,
        "name": chart.get("name"),
        "exchange": chart.get("exchange"),
        "currency": chart.get("currency"),
        "dataSource": chart.get("source", "live"),
        "asOf": bars.index[-1].date().isoformat(),
        "lastPrice": _num(last),
        **returns,
        "high52w": _num(float(year.max())),
        "low52w": _num(float(year.min())),
        "fromHigh52wPct": _pct(last / float(year.max()) - 1),
        "fromLow52wPct": _pct(last / float(year.min()) - 1),
        "volatilityAnnualPct": _pct(float(daily.std(ddof=1) * np.sqrt(ppy))) if len(daily) > 20 else None,
        "maxDrawdown1yPct": _pct(profile.get("maxDrawdown")),
        "betaVsIndex": beta,
        "index": benchmark,
        "sma50": _num(sma50),
        "sma200": _num(sma200),
        "trend": trend,
        "rsi14": _rsi(close),
        "rsiNote": "RSI above 70 is often read as overbought, below 30 as oversold.",
        "strategySignals": signals,
        "mlModelSignal": ml,
        "signalTilt": tilt,
        "caveats": [
            "Signals are the current state of simple rules on past prices; they are not forecasts and have been wrong often in backtests.",
            "No fundamentals or valuation are included unless fetched separately (get_company_capex).",
        ],
    }
