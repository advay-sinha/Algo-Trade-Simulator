"""Research actions shared by the REST API and the copilot's tools.

One implementation per action means the copilot gets no privileged path: it goes through the
same validation (the same Pydantic request models), the same engines, and the same per-user
persistence as the UI. Errors are raised as ActionError with user-facing text.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional

from backend.analytics.risk import build_risk_report, default_benchmark
from backend.models.backtest import BacktestRequest
from backend.models.ml import TrainModelRequest
from backend.services import experiment_tracking
from backend.services import market_data_service as market
from backend.services.backtesting_service import BacktestConfig, bars_from_points, downsample, run_backtest
from backend.services.model_registry_service import tracking_payload, train_and_evaluate
from backend.strategies import get_strategy

logger = logging.getLogger("algo_trade_backend.actions")


class ActionError(Exception):
    def __init__(self, message: str, status: int = 422) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def public_model(record: Dict[str, Any]) -> Dict[str, Any]:
    """Registry record without internal artifact references."""
    return {key: value for key, value in record.items() if not key.startswith("_") and key != "artifactId"}


async def _benchmark_history(symbol: str, range_value: str) -> Optional[Dict[str, Any]]:
    """Benchmark bars for the risk report; failures degrade to 'unavailable', never fail the run."""
    try:
        return await market.get_daily_history(symbol, range_value)
    except Exception:  # noqa: BLE001 - HTTPException from the market service, network errors
        logger.warning("Benchmark history unavailable for %s", symbol)
        return None


async def run_backtest_for_user(payload: BacktestRequest, user_id: str, store: Any) -> Dict[str, Any]:
    try:
        strategy = get_strategy(payload.strategy)
    except KeyError as exc:
        raise ActionError("Unknown strategy") from exc
    try:
        params = strategy.parse_params(payload.params)
    except ValueError as exc:
        # Pydantic messages describe the parameter rule (no internals), so they're safe to return.
        first = exc.errors()[0] if hasattr(exc, "errors") else None
        field = ".".join(str(part) for part in first.get("loc", ())) if first else ""
        message = str(first.get("msg", "")).removeprefix("Value error, ") if first else ""
        raise ActionError(f"Invalid parameter{f' {field}' if field else ''}: {message}" if first else "Invalid strategy parameters") from exc

    benchmark_symbol = (payload.benchmark or default_benchmark(payload.symbol)).upper()
    same_as_symbol = benchmark_symbol == payload.symbol.upper()
    if same_as_symbol:
        chart = await market.get_daily_history(payload.symbol, payload.range)
        benchmark_chart: Optional[Dict[str, Any]] = chart
    else:
        chart, benchmark_chart = await asyncio.gather(
            market.get_daily_history(payload.symbol, payload.range),
            _benchmark_history(benchmark_symbol, payload.range),
        )
    bars = bars_from_points(chart.get("points", []))
    needed = strategy.min_history(params) + 2
    if len(bars) < needed:
        raise ActionError(f"Not enough history: {len(bars)} daily bars, this configuration needs at least {needed}. Choose a longer range.")
    signals = strategy.generate_signals(bars, params)
    result = run_backtest(bars, signals, BacktestConfig(payload.startingCapital, payload.costBps, payload.slippageBps))
    series = result.pop("_series")
    benchmark_bars = bars_from_points(benchmark_chart.get("points", [])) if benchmark_chart else None
    risk = build_risk_report(
        equity=series["equity"],
        buy_hold_equity=series["buyHold"],
        trades=result["trades"],
        benchmark_symbol=benchmark_symbol,
        benchmark_close=benchmark_bars["close"] if benchmark_bars is not None and not benchmark_bars.empty else None,
        benchmark_source=benchmark_chart.get("source") if benchmark_chart else None,
        risk_free_annual=payload.riskFreeRate,
    )
    benchmark_equity = risk.pop("benchmarkEquity")
    record = result | {
        "risk": risk,
        "benchmarkEquity": downsample(benchmark_equity),
        "symbol": payload.symbol.upper(),
        "strategy": {"id": strategy.id, "name": strategy.name, "params": params.model_dump()},
        "range": payload.range,
        "config": {
            "startingCapital": payload.startingCapital,
            "costBps": payload.costBps,
            "slippageBps": payload.slippageBps,
            "benchmark": benchmark_symbol,
            "riskFreeRate": payload.riskFreeRate,
        },
        "dataSource": chart.get("source", "live"),
        "currency": chart.get("currency"),
    }
    return await store.add_backtest(user_id, record)


async def train_model_for_user(payload: TrainModelRequest, user_id: str, store: Any) -> Dict[str, Any]:
    """Train on the earlier window, evaluate on the later unseen window, register the model."""
    chart = await market.get_daily_history(payload.symbol, payload.range)
    try:
        record, artifact = await asyncio.to_thread(train_and_evaluate, payload, chart)
    except ValueError as exc:
        raise ActionError(str(exc)) from exc
    if experiment_tracking.enabled():
        run_name, params, metrics, tags = tracking_payload(record)
        tracked = await asyncio.to_thread(experiment_tracking.log_training_run, run_name, params, metrics, tags)
        record["tracking"] = {"enabled": True, "logged": tracked is not None} | (tracked or {})
    else:
        record["tracking"] = {"enabled": False}
    stored = await store.add_model(user_id, record, artifact)
    return public_model(stored)


async def model_signal_for_user(store: Any, record: Dict[str, Any]) -> Dict[str, Any]:
    artifact = await store.get_artifact(record)
    if artifact is None:
        raise ActionError("Model artifact not found", status=404)
    chart = await market.get_daily_history(record["symbol"], "1y")
    bars = bars_from_points(chart.get("points", []))
    from backend.ml.inference import predict_latest  # lazy: keeps scikit-learn off the cold-start path

    try:
        result = await asyncio.to_thread(predict_latest, record, artifact, bars)
    except ValueError as exc:
        raise ActionError(str(exc)) from exc
    return result | {"dataSource": chart.get("source", "live")}
