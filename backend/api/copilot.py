"""Research copilot (streaming, structured actions, legacy alias)."""
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


copilot_rate_limit = rate_limit("copilot", 15)


@router.post("/chat", dependencies=[Depends(copilot_rate_limit)])
async def chat(payload: ChatRequest, user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    """Legacy non-streaming alias for the copilot (kept for older clients)."""
    history = [{"role": item.role, "content": item.content} for item in payload.history]
    return await copilot_service.collect_chat(user["id"], store, payload.message, history)


@router.post("/copilot/chat", dependencies=[Depends(copilot_rate_limit)])
async def copilot_chat(payload: CopilotChatRequest, user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> StreamingResponse:
    """Server-Sent Events: tool activity as it happens, then the reply, saved actions, and done."""
    history = [turn.model_dump() for turn in payload.history]

    async def events():
        async for event in copilot_service.stream_chat(user["id"], store, payload.message, history):
            yield f"data: {json.dumps(sanitize(event), default=str)}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/copilot/action", dependencies=[Depends(copilot_rate_limit)])
async def copilot_action(payload: CopilotActionRequest, user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    """Run one structured action with the same validation and code path as the REST endpoints."""
    try:
        if payload.action == "run_backtest":
            record = await run_backtest_for_user(BacktestRequest(**payload.params), user["id"], store)
            return {"action": payload.action, "id": record["id"], "path": f"/backtests/{record['id']}", "summary": record["summary"]}
        if payload.action == "train_model":
            record = await train_model_for_user(TrainModelRequest(**payload.params), user["id"], store)
            return {"action": payload.action, "id": record["id"], "path": f"/lab/models/{record['id']}", "classification": record["classification"]}
        from backend.services.simulation_service import create_simulation_for_user

        simulation = await create_simulation_for_user(SimulationInput(**payload.params), user["id"], store)
        return {"action": payload.action, "id": simulation["id"], "path": f"/simulations/{simulation['id']}", "simulation": simulation}
    except ValidationError as exc:
        first = exc.errors()[0]
        raise HTTPException(status_code=422, detail=f"Invalid {'.'.join(str(p) for p in first.get('loc', ()))}: {first.get('msg')}") from exc
    except ActionError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc
