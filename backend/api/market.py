"""Market data: quotes, search, charts."""
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


market_rate_limit = rate_limit("market", settings.market_rate_limit_per_minute)
SymbolPath = Annotated[str, Path(pattern=SYMBOL_PATTERN)]


@router.get("/market/watchlist", dependencies=[Depends(market_rate_limit)])
async def get_watchlist(
    symbols: Optional[str] = Query(default=None, max_length=400),
    user: Dict[str, Any] = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    _ = user
    requested = parse_symbol_list(symbols) if symbols else list(WATCHLIST_SYMBOLS)
    return await market.get_quotes(requested)


@router.get("/market/quote/{symbol}", dependencies=[Depends(market_rate_limit)])
async def get_quote(symbol: SymbolPath, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    _ = user
    quotes = await market.get_quotes([symbol.upper()])
    if not quotes:
        raise HTTPException(status_code=404, detail=f"No quote for {symbol.upper()}")
    return quotes[0]


@router.get("/market/search")
async def search_market(
    q: str = Query(min_length=1, max_length=64),
    user: Dict[str, Any] = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    _ = user  # dependency ensures auth
    return await market.search(q)


@router.get("/market/chart/{symbol}")
async def get_chart(
    symbol: SymbolPath,
    range: ChartRange = "1mo",
    interval: ChartInterval = "1d",
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    _ = user
    return await market.get_chart(symbol, range, interval)
