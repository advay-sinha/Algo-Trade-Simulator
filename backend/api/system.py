"""Operational status and liveness."""
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
from backend.services import copilot_service, experiment_tracking, hf_inference
from backend.services import market_data_service as market
from backend.services.backtesting_service import BacktestConfig, bars_from_points, run_backtest
from backend.services.clock import now
from backend.services.feature_service import preview_dataset
from backend.services.market_data_service import MARKET_HEALTH, build_offline_chart
from backend.services import rate_limiter
from backend.services.rate_limiter import rate_limit
from backend.services.research_actions import ActionError, model_signal_for_user, public_model, run_backtest_for_user, train_model_for_user
from backend.stores import MongoStore
from backend.strategies import REGISTRY as STRATEGY_REGISTRY, get_strategy, list_strategies

logger = logging.getLogger("algo_trade_backend")
router = APIRouter(prefix="/api")


@router.get("/status")
async def system_status(
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    """Operational snapshot for the console. Never includes DSNs, keys, or error text."""
    _ = user
    return {
        "version": APP_VERSION,
        "serverTime": now().isoformat(),
        "store": "mongo" if isinstance(store, MongoStore) else "memory",
        "strictDb": settings.strict_db,
        "devEndpoints": dev_endpoints_enabled(),
        "copilotConfigured": copilot_service.configured(),
        "copilotProvider": copilot_service.provider_info(),
        "experimentTracking": experiment_tracking.enabled(),
        "nlp": hf_inference.info() | {"vectorSearch": "atlas" if settings.atlas_vector_index and isinstance(store, MongoStore) else "exact"},
        "offlineMarketDataAllowed": settings.allow_offline_market_data,
        "marketData": dict(MARKET_HEALTH),
        "rateLimits": {
            "authPerMinute": settings.auth_rate_limit_per_minute,
            "marketPerMinute": settings.market_rate_limit_per_minute,
            "shared": rate_limiter.storage_kind() == "shared",
        },
    }


@router.get("/health")
async def health() -> Dict[str, Any]:
    return {"status": "ok", "timestamp": now().isoformat()}
