"""Backtests and their risk reports."""
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

logger = logging.getLogger("algo_trade_backend")
router = APIRouter(prefix="/api")


backtest_rate_limit = rate_limit("backtest", 20)


@router.post("/backtest/run", dependencies=[Depends(backtest_rate_limit)])
async def run_backtest_endpoint(
    payload: BacktestRequest,
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    try:
        return await run_backtest_for_user(payload, user["id"], store)
    except ActionError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc


@router.get("/backtests")
async def list_backtests(user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> List[Dict[str, Any]]:
    return await store.list_backtests(user["id"])


@router.get("/backtest/{backtest_id}")
async def get_backtest(
    backtest_id: str = Path(min_length=1, max_length=64),
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    record = await store.get_backtest(user["id"], backtest_id)
    if not record:
        raise HTTPException(status_code=404, detail="Backtest not found")
    return {key: value for key, value in record.items() if key != "trades"} | {"tradeCount": len(record.get("trades", []))}


@router.get("/backtest/{backtest_id}/risk")
async def get_backtest_risk(
    backtest_id: str = Path(min_length=1, max_length=64),
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    record = await store.get_backtest(user["id"], backtest_id)
    if not record:
        raise HTTPException(status_code=404, detail="Backtest not found")
    if not record.get("risk"):
        raise HTTPException(status_code=404, detail="This run predates risk analytics; run it again to get a risk report")
    return record["risk"]


@router.get("/backtest/{backtest_id}/trades")
async def get_backtest_trades(
    backtest_id: str = Path(min_length=1, max_length=64),
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> List[Dict[str, Any]]:
    record = await store.get_backtest(user["id"], backtest_id)
    if not record:
        raise HTTPException(status_code=404, detail="Backtest not found")
    return record.get("trades", [])
