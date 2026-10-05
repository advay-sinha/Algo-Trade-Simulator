"""Paper-trading simulations: CRUD plus forward evaluation (services/simulation_service.py)."""
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
from backend.services import simulation_service
from backend.services.research_actions import ActionError, model_signal_for_user, public_model, run_backtest_for_user, train_model_for_user
from backend.stores import MongoStore
from backend.strategies import REGISTRY as STRATEGY_REGISTRY, get_strategy, list_strategies

logger = logging.getLogger("algo_trade_backend")
router = APIRouter(prefix="/api")
simulation_report_rate_limit = rate_limit("simulation-report", 60)


@router.get("/simulations")
async def list_simulations(user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> List[Dict[str, Any]]:
    return [simulation_service.public_simulation(record) for record in await store.list_simulations(user["id"])]


@router.get("/simulations/summaries", dependencies=[Depends(simulation_report_rate_limit)])
async def simulation_summaries(user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Dict[str, Any]]:
    """Card-sized performance per simulation (newest 20 running ones are evaluated; finished ones are frozen)."""
    return await simulation_service.summaries_for_user(user["id"], store)


@router.post("/simulations")
async def create_simulation(payload: SimulationInput, user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    try:
        return await simulation_service.create_simulation_for_user(payload, user["id"], store)
    except ActionError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc


@router.get("/simulations/{sim_id}")
async def get_simulation(sim_id: str, user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    record = await store.get_simulation(user["id"], sim_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return simulation_service.public_simulation(record)


@router.get("/simulations/{sim_id}/report", dependencies=[Depends(simulation_report_rate_limit)])
async def get_simulation_report(sim_id: str, user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    try:
        return await simulation_service.report_for_user(user["id"], sim_id, store)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Simulation not found") from exc


@router.patch("/simulations/{sim_id}")
async def patch_simulation(
    sim_id: str,
    payload: SimulationUpdate,
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    try:
        return await simulation_service.update_simulation_for_user(user["id"], sim_id, payload, store)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Simulation not found") from exc
    except ActionError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc


@router.delete("/simulations/{sim_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def remove_simulation(sim_id: str, user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Response:
    try:
        await store.delete_simulation(user["id"], sim_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Simulation not found") from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
