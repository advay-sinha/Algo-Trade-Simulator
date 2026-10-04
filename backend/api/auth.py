"""Accounts and sessions."""
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


signup_rate_limit = rate_limit("auth-signup", settings.auth_rate_limit_per_minute)
login_rate_limit = rate_limit("auth-login", settings.auth_rate_limit_per_minute)
dev_auth_rate_limit = rate_limit("auth-dev", settings.auth_rate_limit_per_minute)


@router.post("/auth/signup", dependencies=[Depends(signup_rate_limit)])
async def signup(payload: SignupRequest, store: Store = Depends(get_store)) -> Dict[str, Any]:
    try:
        user = await store.create_user(payload.email, payload.name, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered") from exc
    session = await store.create_session(user["id"])
    return {"token": session["token"], "user": user}


@router.post("/auth/login", dependencies=[Depends(login_rate_limit)])
async def login(payload: LoginRequest, store: Store = Depends(get_store)) -> Dict[str, Any]:
    user = await store.get_user_by_credentials(payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    session = await store.create_session(user["id"])
    return {"token": session["token"], "user": user}


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def logout(user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Response:
    await store.delete_session(user["token"])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/dev/auth/bypass", dependencies=[Depends(dev_auth_rate_limit)])
async def dev_auth_bypass(
    payload: Optional[DevAuthBypassRequest] = None,
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    if not dev_endpoints_enabled():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dev endpoints are disabled")
    email = (payload.email if payload and payload.email else "dev@example.com").lower()
    name = payload.name if payload and payload.name else "Dev User"
    user = await store.ensure_user(email, name)
    session = await store.create_session(user["id"])
    return {"token": session["token"], "user": user}


# Quote endpoints require a session and are rate limited per client, so the API can't be
# used as an open Yahoo proxy (which would also get the deployment's IPs throttled).
