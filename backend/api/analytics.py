"""Overview, strategy catalog, sparklines, and the Lab trainer."""
from __future__ import annotations

import asyncio
import json
import logging
import math
from datetime import datetime, timezone
from typing import Annotated, Any, Dict, List, Literal, Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

from backend.analytics.metrics import PERIODS_PER_YEAR, sanitize, series_metrics, win_rate
from backend.catalog import DEFAULT_STRATEGIES, WATCHLIST_SYMBOLS
from backend.config import APP_VERSION, settings
from backend.deps import Store, dev_endpoints_enabled, get_current_user, get_store
from backend.ml.features import catalog as feature_catalog
from backend.models.analytics import ChatRequest, PredictionPayload, TrainingPayload
from backend.models.auth import DevAuthBypassRequest, LoginRequest, SignupRequest
from backend.models.backtest import BacktestRequest
from backend.models.common import SYMBOL_PATTERN, ChartInterval, ChartRange, parse_symbol_list
from backend.models.copilot import CopilotActionRequest, CopilotChatRequest
from backend.models.ml import FeaturesRequest, PredictRequest, TrainModelRequest
from backend.models.simulation import SimulationInput, SimulationUpdate
from backend.services import copilot_service, experiment_tracking
from backend.services import market_data_service as market
from backend.services.backtesting_service import BacktestConfig, bars_from_points, run_backtest
from backend.services.clock import now
from backend.services.feature_service import preview_dataset
from backend.services.market_data_service import MARKET_HEALTH, build_offline_chart
from backend.services.rate_limiter import rate_limit
from backend.services.research_actions import ActionError, model_signal_for_user, public_model, run_backtest_for_user, train_model_for_user
from backend.stores import MongoStore
from backend.strategies import REGISTRY as STRATEGY_REGISTRY, get_strategy, list_strategies

from backend.api.ml import _model_signal  # shared model-signal helper

logger = logging.getLogger("algo_trade_backend")
router = APIRouter(prefix="/api")


@router.get("/analytics/strategies")
async def get_strategies() -> List[Dict[str, Any]]:
    return [entry | {"runnable": entry["id"] in STRATEGY_REGISTRY} for entry in DEFAULT_STRATEGIES]


@router.get("/strategies")
async def get_runnable_strategies() -> List[Dict[str, Any]]:
    """Strategies the backtester can run, with their parameter schema."""
    return list_strategies()


@router.get("/analytics/overview")
async def get_overview(user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    simulations = await store.list_simulations(user["id"])
    trained = await store.list_trained(user["id"])

    sanitised_simulations: List[Dict[str, Any]] = []
    total_capital = 0.0
    capital_samples = 0
    active = 0
    completed = 0

    for simulation in simulations:
        capital_value = simulation.get("startingCapital", 0)
        capital = 0.0
        capital_valid = False
        if isinstance(capital_value, (int, float)):
            if isinstance(capital_value, float) and math.isnan(capital_value):
                capital = 0.0
            else:
                capital = float(capital_value)
                capital_valid = True
        elif isinstance(capital_value, str):
            try:
                parsed = float(capital_value)
            except ValueError:
                parsed = 0.0
            if math.isnan(parsed):
                parsed = 0.0
            else:
                capital_valid = True
            capital = parsed
        total_capital += capital
        if capital_valid:
            capital_samples += 1

        raw_status = simulation.get("status")
        status = raw_status.strip() if isinstance(raw_status, str) else ""
        lowered_status = status.lower()
        if lowered_status == "active":
            active += 1
        elif lowered_status == "completed":
            completed += 1

        sanitised_simulations.append(
            simulation
            | {
                "startingCapital": capital,
                "status": status if status else "unknown",
            }
        )

    def simulation_created_at(simulation: Dict[str, Any]) -> datetime:
        created = simulation.get("createdAt")
        if isinstance(created, str):
            try:
                return datetime.fromisoformat(created)
            except ValueError:
                pass
        return datetime.fromtimestamp(0, tz=timezone.utc)

    recent = sorted(sanitised_simulations, key=simulation_created_at, reverse=True)[:5]

    trained_symbols: List[str] = []
    for entry in trained:
        payload = entry.get("payload") or {}
        strategy_hint = payload.get("strategyId") or entry.get("strategy_id") or payload.get("strategy_id") or "unknown"
        symbol = entry.get("symbol") or payload.get("symbol")
        if not symbol:
            continue
        trained_symbols.append(f"{symbol} ({strategy_hint})")

    totals = {
        "totalSimulations": len(sanitised_simulations),
        "activeSimulations": active,
        "completedSimulations": completed,
        "totalStartingCapital": total_capital,
        "averageStartingCapital": total_capital / capital_samples if capital_samples else 0.0,
        "trainedModels": len(trained),
    }

    return {
        "totals": totals,
        "watchlist": WATCHLIST_SYMBOLS,
        "recentSimulations": recent,
        "strategiesTrained": trained_symbols,
    }


@router.get("/analytics/training")
async def list_training_runs(user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> List[Dict[str, Any]]:
    """Past training runs (one per symbol), newest first, without the bulky price sample."""
    runs: List[Dict[str, Any]] = []
    for entry in await store.list_trained(user["id"]):
        payload = entry.get("payload") or {}
        runs.append(
            {
                "symbol": entry.get("symbol") or payload.get("symbol"),
                "strategyId": payload.get("strategyId") or entry.get("strategy_id"),
                "shortWindow": payload.get("shortWindow"),
                "longWindow": payload.get("longWindow"),
                "metrics": payload.get("metrics") or {},
                "trainedAt": payload.get("trainedAt") or entry.get("trained_at"),
            }
        )
    runs.sort(key=lambda run: run.get("trainedAt") or "", reverse=True)
    return runs


@router.get("/analytics/sparkline")
async def get_sparkline(
    symbols: Optional[str] = Query(default=None, max_length=400),
    user: Dict[str, Any] = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    _ = user
    requested = parse_symbol_list(symbols) if symbols else list(WATCHLIST_SYMBOLS)
    # Fetch concurrently in worker threads: the sync Yahoo clients must not block the event loop.
    charts = await asyncio.gather(
        *(market.get_chart(symbol, "1mo", "1d") for symbol in requested),
        return_exceptions=True,
    )
    series: List[Dict[str, Any]] = []
    for symbol, outcome in zip(requested, charts):
        try:
            if isinstance(outcome, BaseException):
                raise outcome
            chart = outcome
        except HTTPException as exc:
            logger.warning("Sparkline chart fetch failed for %s: %s", symbol, exc)
            chart = build_offline_chart(symbol, "1mo", "1d")
        except Exception as exc:  # noqa: BLE001
            logger.error("Unexpected sparkline error for %s: %s", symbol, exc, exc_info=True)
            chart = build_offline_chart(symbol, "1mo", "1d")

        points = [
            {"timestamp": point["timestamp"], "close": point["close"]}
            for point in chart.get("points", [])[-40:]
            if "timestamp" in point and "close" in point
        ]
        fallback_symbol = chart.get("symbol", symbol)
        series.append({"symbol": fallback_symbol, "points": points, "source": chart.get("source", "live")})
    return series


@router.post("/analytics/train")
async def train_strategy(payload: TrainingPayload, user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    """Lab trainer: a zero-cost SMA-crossover backtest over 6 months of daily bars (in-sample)."""
    if payload.shortWindow >= payload.longWindow:
        raise HTTPException(status_code=422, detail="shortWindow must be less than longWindow")
    chart = await market.get_chart(payload.symbol, "6mo", "1d")
    bars = bars_from_points(chart.get("points", []))
    if len(bars) < payload.longWindow + 10:
        raise HTTPException(status_code=422, detail="Not enough history for requested windows")
    strategy = get_strategy("sma-crossover")
    params = strategy.parse_params({"shortWindow": payload.shortWindow, "longWindow": payload.longWindow})
    signals = strategy.generate_signals(bars, params)
    result = run_backtest(bars, signals, BacktestConfig(starting_capital=100_000))
    equity = result.pop("_series")["equity"]
    curve_values, _ = series_metrics(equity, PERIODS_PER_YEAR["1d"], 0.0)
    trade_win_rate, _ = win_rate(result["trades"])
    close = bars["close"]
    short_sma = close.rolling(payload.shortWindow, min_periods=payload.shortWindow).mean()
    long_sma = close.rolling(payload.longWindow, min_periods=payload.longWindow).mean()
    tail = bars.index[-120:]
    sample = [
        {
            "timestamp": ts.isoformat(),
            "close": float(close.loc[ts]),
            "shortSma": float(short_sma.loc[ts]) if pd.notna(short_sma.loc[ts]) else float(close.loc[ts]),
            "longSma": float(long_sma.loc[ts]) if pd.notna(long_sma.loc[ts]) else float(close.loc[ts]),
        }
        for ts in tail
    ]
    strategy_id = payload.strategyId or f"sma-{payload.shortWindow}-{payload.longWindow}"
    result_payload = sanitize(
        {
            "symbol": payload.symbol.upper(),
            "strategyId": strategy_id,
            "shortWindow": payload.shortWindow,
            "longWindow": payload.longWindow,
            "metrics": {
                "totalReturn": curve_values.get("totalReturn"),
                "annualizedReturn": curve_values.get("cagr"),
                "winRate": trade_win_rate,
                "trades": result["summary"]["tradeCount"],
                "sharpe": curve_values.get("sharpe"),
                "maxDrawdown": curve_values.get("maxDrawdown"),
            },
            "basis": "Zero-cost SMA crossover backtest, next-bar fills, whole window in-sample",
            "dataSource": chart.get("source", "live"),
            "sample": sample,
            "trainedAt": now().isoformat(),
        }
    )
    await store.record_training(user["id"], payload.symbol, strategy_id, result_payload)
    return result_payload


@router.post("/analytics/predict")
async def predict(payload: PredictionPayload, user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    model_record = await store.latest_model(user["id"], payload.symbol)
    if model_record:
        result = await _model_signal(store, user["id"], model_record)
        top = max(result["probabilities"].values()) if result.get("probabilities") else None
        return {
            "symbol": payload.symbol.upper(),
            "strategyId": f"ml:{model_record['modelType']}",
            "signal": "buy" if result["signal"] == "buy" else "hold",
            "confidence": top if top is not None else 0.0,
            "summary": f"{model_record['modelName']} trained {model_record['trainedAt'][:10]} predicts '{result['predictionName']}' for the next {model_record['label']['horizon']} bar(s).",
            "metadata": {"basis": "ml-model", "modelId": model_record["id"], "probabilities": result.get("probabilities")},
            "generatedAt": now().isoformat(),
        }
    training = await store.get_training(user["id"], payload.symbol)
    if not training:
        raise HTTPException(status_code=404, detail="Train the strategy first")
    chart = await market.get_chart(payload.symbol, "1mo", "1d")
    closes = [point["close"] for point in chart["points"]]
    if len(closes) < 5:
        raise HTTPException(status_code=422, detail="Not enough data for prediction")
    recent = closes[-5:]
    momentum = recent[-1] - recent[0]
    signal = "buy" if momentum > 0 else "sell" if momentum < 0 else "hold"
    baseline = abs(recent[-1]) if recent[-1] else 1
    confidence = min(abs(momentum) / baseline, 1)
    summary = (
        f"Short-term momentum is {'positive' if signal == 'buy' else 'negative' if signal == 'sell' else 'flat'} with the "
        f"last close at {recent[-1]:.2f}."
    )
    return {
        "symbol": payload.symbol.upper(),
        "strategyId": training["payload"].get("strategyId", training["strategy_id"]),
        "signal": signal,
        "confidence": confidence,
        "summary": summary,
        "metadata": {"recent": recent, "basis": "naive-momentum"},
        "generatedAt": now().isoformat(),
    }
