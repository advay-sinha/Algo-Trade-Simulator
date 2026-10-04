"""Feature datasets, model training, registry, and signals."""
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


features_rate_limit = rate_limit("ml-features", 20)


@router.get("/ml/feature-catalog")
async def get_feature_catalog() -> List[Dict[str, Any]]:
    """Every feature generator with its group, description, and default parameters."""
    return feature_catalog()


@router.post("/ml/features", dependencies=[Depends(features_rate_limit)])
async def preview_features(payload: FeaturesRequest, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Build a leakage-free dataset for a symbol and return a preview (nothing is stored)."""
    _ = user
    chart = await market.get_daily_history(payload.symbol, payload.range)
    try:
        # CPU-bound pandas work: keep it off the event loop.
        return await asyncio.to_thread(preview_dataset, payload, chart)
    except ValueError as exc:
        # Messages come from our own validation (unknown feature, too little history) — safe to show.
        raise HTTPException(status_code=422, detail=str(exc)) from exc


train_rate_limit = rate_limit("ml-train", 10)


@router.post("/ml/train", dependencies=[Depends(train_rate_limit)])
async def train_ml_model(
    payload: TrainModelRequest,
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    """Train on the earlier window, evaluate on the later unseen window, register the model."""
    try:
        return await train_model_for_user(payload, user["id"], store)
    except ActionError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc


@router.get("/ml/models")
async def list_ml_models(user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> List[Dict[str, Any]]:
    return await store.list_models(user["id"])


@router.get("/ml/models/{model_id}")
async def get_ml_model(
    model_id: str = Path(min_length=1, max_length=64),
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    record = await store.get_model(user["id"], model_id)
    if not record:
        raise HTTPException(status_code=404, detail="Model not found")
    return public_model(record)


async def _model_signal(store: Store, user_id: str, record: Dict[str, Any]) -> Dict[str, Any]:
    try:
        return await model_signal_for_user(store, record)
    except ActionError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc


@router.post("/ml/predict")
async def predict_ml(
    payload: PredictRequest,
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    if payload.modelId:
        record = await store.get_model(user["id"], payload.modelId)
    elif payload.symbol:
        record = await store.latest_model(user["id"], payload.symbol)
    else:
        raise HTTPException(status_code=422, detail="Provide modelId or symbol")
    if not record:
        raise HTTPException(status_code=404, detail="No trained model found; train one first")
    return await _model_signal(store, user["id"], record)
