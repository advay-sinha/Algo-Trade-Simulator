from __future__ import annotations

import asyncio
import logging
import math
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Dict, List, Literal, Optional, Union

from backend.config import (
    IS_PRODUCTION,
    ON_VERCEL,
    allowed_cors_origins,
    mask_mongo_dsn,
    resolve_mongo_dsn,
    settings,
)
from backend.models.common import (
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    SYMBOL_PATTERN,
    ChartInterval,
    ChartRange,
    SimulationStatus,
    check_password_policy,
    parse_symbol_list,
)
from backend.services.auth_tokens import generate_session_token, hash_session_token
from backend.services.clock import now
from backend.models.backtest import BacktestRequest
from backend.services.backtesting_service import BacktestConfig, bars_from_points, downsample, run_backtest
from backend.strategies import REGISTRY as STRATEGY_REGISTRY, get_strategy, list_strategies
from backend.analytics.metrics import PERIODS_PER_YEAR, sanitize, series_metrics, win_rate
from backend.analytics.risk import build_risk_report, default_benchmark
from backend.ml.features import catalog as feature_catalog
from backend.models.ml import FeaturesRequest, PredictRequest, TrainModelRequest
from backend.services import experiment_tracking
from backend.services.model_registry_service import tracking_payload, train_and_evaluate
from backend.services.feature_service import preview_dataset
from backend.models.copilot import CopilotActionRequest, CopilotChatRequest
from backend.services import copilot_service
import json
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from backend.services.research_actions import ActionError, model_signal_for_user, public_model, run_backtest_for_user, train_model_for_user
import pandas as pd
from backend.services import market_data_service as market
from backend.services.market_data_service import MARKET_HEALTH, build_offline_chart
from backend.services.rate_limiter import rate_limit

try:
    from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
    from pymongo import ASCENDING, DESCENDING, ReturnDocument
    from pymongo.errors import DuplicateKeyError
    from bson import ObjectId  # type: ignore[attr-defined]
    from bson.errors import InvalidId  # type: ignore[attr-defined]
except ModuleNotFoundError:  # pragma: no cover - optional dependency
    AsyncIOMotorClient = None
    AsyncIOMotorGridFSBucket = None
    ASCENDING = DESCENDING = ReturnDocument = None
    DuplicateKeyError = None
    ObjectId = None
    InvalidId = None

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Path, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field, field_validator

WATCHLIST_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA"]
DEFAULT_STRATEGIES: List[Dict[str, Any]] = [
    {
        "id": "sma-crossover",
        "name": "Simple moving average crossover",
        "description": "Classic two-line crossover highlighting short vs long momentum shifts.",
        "recommendedFor": ["momentum", "swing"],
        "parameters": [
            {"name": "shortWindow", "value": "20"},
            {"name": "longWindow", "value": "60"},
        ],
    },
    {
        "id": "mean-reversion",
        "name": "Mean reversion channel",
        "description": "Pairs Bollinger style envelopes with RSI to fade stretched moves.",
        "recommendedFor": ["range-bound", "volatility"],
        "parameters": [
            {"name": "lookback", "value": "14"},
            {"name": "deviation", "value": "2"},
        ],
    },
    {
        "id": "momentum",
        "name": "Time-series momentum",
        "description": "Stay long while the trailing return over a lookback window is positive.",
        "recommendedFor": ["trend", "momentum"],
        "parameters": [
            {"name": "lookback", "value": "20"},
            {"name": "threshold", "value": "0"},
        ],
    },
    {
        "id": "trend-follow",
        "name": "Trend following breakout",
        "description": "Capture breakouts by combining Donchian channels with ATR filters.",
        "recommendedFor": ["breakout", "trend"],
        "parameters": [
            {"name": "channel", "value": "20"},
            {"name": "atr", "value": "14"},
        ],
    },
]

def coerce_object_id(value: Any) -> Any:
    if ObjectId is None:
        return value
    if isinstance(value, str):
        try:
            return ObjectId(value)
        except Exception:  # pragma: no cover - defensive, InvalidId not available without bson
            return value
    return value


def stringify_object_id(value: Any) -> Any:
    if ObjectId is None:
        return value
    if isinstance(value, ObjectId):
        return str(value)
    return value


logger = logging.getLogger("algo_trade_backend")

app = FastAPI(
    title="Algo Trade Simulator API",
    version="0.3.0",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_cors_origins(settings),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Every route lives under /api so the SPA and the API can share one origin.
router = APIRouter(prefix="/api")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

if settings.enable_dev_endpoints:
    if IS_PRODUCTION:
        logger.error("ENABLE_DEV_ENDPOINTS is set in production; dev endpoints stay disabled")
    else:
        logger.warning(
            "DEV ENDPOINTS ENABLED: /api/dev/auth/bypass issues sessions without a password. Local development only."
        )


def dev_endpoints_enabled() -> bool:
    return settings.enable_dev_endpoints and not IS_PRODUCTION


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)
    name: str = Field(min_length=1, max_length=120)

    @field_validator("password")
    @classmethod
    def password_not_common(cls, value: str) -> str:
        return check_password_policy(value)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=PASSWORD_MAX_LENGTH)


class DevAuthBypassRequest(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = Field(default=None, max_length=120)


class SimulationInput(BaseModel):
    symbol: str = Field(pattern=SYMBOL_PATTERN)
    strategy: str = Field(min_length=1, max_length=60)
    startingCapital: float = Field(gt=0)
    notes: Optional[str] = Field(default=None, max_length=400)


class SimulationUpdate(BaseModel):
    status: Optional[SimulationStatus] = None
    notes: Optional[str] = Field(default=None, max_length=400)


class TrainingPayload(BaseModel):
    symbol: str = Field(pattern=SYMBOL_PATTERN)
    shortWindow: int = Field(gt=1, le=200)
    longWindow: int = Field(gt=2, le=400)
    strategyId: Optional[str] = Field(default=None, max_length=60)


class PredictionPayload(BaseModel):
    symbol: str = Field(pattern=SYMBOL_PATTERN)


class ChatHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: List[ChatHistoryItem] = Field(default_factory=list)



BACKTEST_SUMMARY_FIELDS = ("id", "symbol", "strategy", "range", "period", "summary", "dataSource", "createdAt")
RISK_HEADLINE_FIELDS = ("sharpe", "sortino", "cagr", "volatility", "winRate")


def model_summary(record: Dict[str, Any]) -> Dict[str, Any]:
    classification = record.get("classification") or {}
    strategy_summary = (record.get("strategy") or {}).get("summary") or {}
    strategy_metrics = (record.get("strategy") or {}).get("metrics") or {}
    return {
        "id": record.get("id"),
        "symbol": record.get("symbol"),
        "modelType": record.get("modelType"),
        "modelName": record.get("modelName"),
        "label": record.get("label"),
        "range": record.get("range"),
        "trainedAt": record.get("trainedAt"),
        "dataSource": record.get("dataSource"),
        "artifactBytes": record.get("artifactBytes"),
        "accuracy": classification.get("accuracy"),
        "baselineAccuracy": classification.get("baselineAccuracy"),
        "rocAuc": classification.get("rocAuc"),
        "strategyReturn": strategy_summary.get("totalReturn"),
        "buyHoldReturn": strategy_summary.get("buyHoldReturn"),
        "strategySharpe": strategy_metrics.get("sharpe"),
        "tracking": record.get("tracking"),
    }


def backtest_summary(record: Dict[str, Any]) -> Dict[str, Any]:
    summary = {key: record.get(key) for key in BACKTEST_SUMMARY_FIELDS}
    metrics = (record.get("risk") or {}).get("metrics") or {}
    summary["riskHeadline"] = {key: metrics.get(key) for key in RISK_HEADLINE_FIELDS} if metrics else None
    return summary


class InMemoryStore:
    def __init__(self) -> None:
        self.lock = asyncio.Lock()
        self.users_by_email: Dict[str, Dict[str, Any]] = {}
        self.users_by_id: Dict[str, Dict[str, Any]] = {}
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.simulations: Dict[str, Dict[str, Any]] = {}
        self.trained: Dict[str, Dict[str, Any]] = {}
        self.backtests: Dict[str, Dict[str, Any]] = {}
        self.models: Dict[str, Dict[str, Any]] = {}
        self.artifacts: Dict[str, bytes] = {}

    async def create_user(self, email: str, name: str, password: str) -> Dict[str, Any]:
        async with self.lock:
            if email.lower() in self.users_by_email:
                raise ValueError("Email already registered")
            user_id = uuid.uuid4().hex
            record = {
                "id": user_id,
                "email": email.lower(),
                "name": name,
                "password_hash": pwd_context.hash(password),
                "createdAt": now().isoformat(),
            }
            self.users_by_email[email.lower()] = record
            self.users_by_id[user_id] = record
            return {"id": record["id"], "email": record["email"], "name": record["name"]}

    async def get_user_by_credentials(self, email: str, password: str) -> Optional[Dict[str, Any]]:
        async with self.lock:
            record = self.users_by_email.get(email.lower())
            if not record:
                return None
            if not pwd_context.verify(password, record["password_hash"]):
                return None
            return {"id": record["id"], "email": record["email"], "name": record["name"]}

    async def ensure_user(self, email: str, name: str) -> Dict[str, Any]:
        async with self.lock:
            record = self.users_by_email.get(email.lower())
            if record:
                return {"id": record["id"], "email": record["email"], "name": record["name"]}
            user_id = uuid.uuid4().hex
            password = secrets.token_urlsafe(12)
            record = {
                "id": user_id,
                "email": email.lower(),
                "name": name,
                "password_hash": pwd_context.hash(password),
                "createdAt": now().isoformat(),
            }
            self.users_by_email[email.lower()] = record
            self.users_by_id[user_id] = record
            return {"id": record["id"], "email": record["email"], "name": record["name"]}

    async def create_session(self, user_id: str) -> Dict[str, Any]:
        async with self.lock:
            token = generate_session_token()
            expiry = now() + timedelta(days=settings.session_duration_days)
            self.sessions[hash_session_token(token)] = {"user_id": user_id, "expires_at": expiry}
            return {"token": token, "expires_at": expiry}

    async def delete_session(self, token: str) -> None:
        async with self.lock:
            self.sessions.pop(hash_session_token(token), None)

    async def resolve_token(self, token: str) -> Optional[Dict[str, Any]]:
        async with self.lock:
            token_hash = hash_session_token(token)
            session = self.sessions.get(token_hash)
            if not session:
                return None
            if session["expires_at"] <= now():
                self.sessions.pop(token_hash, None)
                return None
            user = self.users_by_id.get(session["user_id"])
            if not user:
                return None
            return {"id": user["id"], "email": user["email"], "name": user["name"]}

    async def list_simulations(self, user_id: str) -> List[Dict[str, Any]]:
        async with self.lock:
            return [
                record
                for record in self.simulations.values()
                if record["userId"] == user_id
            ]

    async def add_simulation(
        self,
        user_id: str,
        payload: SimulationInput,
    ) -> Dict[str, Any]:
        async with self.lock:
            sim_id = uuid.uuid4().hex
            record = {
                "id": sim_id,
                "userId": user_id,
                "symbol": payload.symbol.upper(),
                "strategy": payload.strategy,
                "startingCapital": float(payload.startingCapital),
                "status": "active",
                "notes": payload.notes,
                "createdAt": now().isoformat(),
            }
            self.simulations[sim_id] = record
            return record

    async def update_simulation(self, user_id: str, sim_id: str, payload: SimulationUpdate) -> Dict[str, Any]:
        async with self.lock:
            record = self.simulations.get(sim_id)
            if not record or record["userId"] != user_id:
                raise KeyError("Simulation not found")
            if payload.status is not None:
                record["status"] = payload.status
            if payload.notes is not None:
                record["notes"] = payload.notes
            return record

    async def delete_simulation(self, user_id: str, sim_id: str) -> None:
        async with self.lock:
            record = self.simulations.get(sim_id)
            if not record or record["userId"] != user_id:
                raise KeyError("Simulation not found")
            self.simulations.pop(sim_id, None)

    async def record_training(self, user_id: str, symbol: str, strategy_id: str, payload: Dict[str, Any]) -> None:
        async with self.lock:
            key = f"{user_id}:{symbol.upper()}"
            self.trained[key] = {
                "symbol": symbol.upper(),
                "strategy_id": strategy_id,
                "user_id": user_id,
                "payload": payload,
                "trained_at": now().isoformat(),
            }

    async def get_training(self, user_id: str, symbol: str) -> Optional[Dict[str, Any]]:
        async with self.lock:
            return self.trained.get(f"{user_id}:{symbol.upper()}")

    async def list_trained(self, user_id: str) -> List[Dict[str, Any]]:
        async with self.lock:
            return [item for item in self.trained.values() if item["user_id"] == user_id]

    async def add_backtest(self, user_id: str, record: Dict[str, Any]) -> Dict[str, Any]:
        async with self.lock:
            stored = record | {"id": uuid.uuid4().hex, "userId": user_id, "createdAt": now().isoformat()}
            self.backtests[stored["id"]] = stored
            return stored

    async def get_backtest(self, user_id: str, backtest_id: str) -> Optional[Dict[str, Any]]:
        async with self.lock:
            record = self.backtests.get(backtest_id)
            return record if record and record["userId"] == user_id else None

    async def list_backtests(self, user_id: str) -> List[Dict[str, Any]]:
        async with self.lock:
            records = [backtest_summary(r) for r in self.backtests.values() if r["userId"] == user_id]
        return sorted(records, key=lambda r: r["createdAt"], reverse=True)

    async def add_model(self, user_id: str, record: Dict[str, Any], artifact: bytes) -> Dict[str, Any]:
        async with self.lock:
            model_id = uuid.uuid4().hex
            self.artifacts[model_id] = artifact
            stored = record | {"id": model_id, "userId": user_id, "artifactId": model_id}
            self.models[model_id] = stored
            return stored

    async def get_model(self, user_id: str, model_id: str) -> Optional[Dict[str, Any]]:
        async with self.lock:
            record = self.models.get(model_id)
            return record if record and record["userId"] == user_id else None

    async def list_models(self, user_id: str) -> List[Dict[str, Any]]:
        async with self.lock:
            records = [model_summary(r) for r in self.models.values() if r["userId"] == user_id]
        return sorted(records, key=lambda r: r["trainedAt"], reverse=True)

    async def latest_model(self, user_id: str, symbol: str) -> Optional[Dict[str, Any]]:
        async with self.lock:
            records = [r for r in self.models.values() if r["userId"] == user_id and r["symbol"] == symbol.upper()]
        return max(records, key=lambda r: r["trainedAt"]) if records else None

    async def get_artifact(self, record: Dict[str, Any]) -> Optional[bytes]:
        async with self.lock:
            return self.artifacts.get(record["artifactId"])


class MongoStore:
    def __init__(self, dsn: str, db_name: str) -> None:
        if AsyncIOMotorClient is None:  # pragma: no cover - guarded by import
            raise RuntimeError("MongoDB driver is not available")
        # Small pool + short server selection: many serverless instances may each hold a pool,
        # and a request must fail fast rather than hang when the cluster is unreachable.
        self.client = AsyncIOMotorClient(
            dsn,
            maxPoolSize=settings.mongo_max_pool_size,
            serverSelectionTimeoutMS=5000,
        )
        self.db = self.client[db_name]
        self.users = self.db["users"]
        self.sessions = self.db["sessions"]
        self.simulations = self.db["simulations"]
        self.training = self.db["training"]
        self.backtests = self.db["backtests"]
        self.models = self.db["models"]
        # Model artifacts live in GridFS (never on local disk: serverless filesystems are ephemeral).
        self.artifacts = AsyncIOMotorGridFSBucket(self.db, bucket_name="model_artifacts") if AsyncIOMotorGridFSBucket else None
        self._indexes_ready = False

    async def init(self) -> None:
        if self._indexes_ready:
            return
        await self.client.admin.command("ping")
        await self.users.create_index("email", unique=True)
        await self.sessions.create_index("expiresAt", expireAfterSeconds=0)
        await self.sessions.create_index("userId")
        await self.simulations.create_index([("userId", ASCENDING or 1), ("createdAt", DESCENDING or -1)])
        await self.training.create_index([("userId", ASCENDING or 1), ("symbol", ASCENDING or 1)], unique=True)
        await self.backtests.create_index([("userId", ASCENDING or 1), ("createdAt", DESCENDING or -1)])
        await self.models.create_index([("userId", ASCENDING or 1), ("symbol", ASCENDING or 1), ("trainedAt", DESCENDING or -1)])
        # Sessions created before token hashing stored the raw token (as _id and/or a token
        # field). Those are replayable if leaked, so invalidate them; users simply sign in again.
        legacy = await self.sessions.delete_many(
            {"$or": [{"token": {"$exists": True}}, {"tokenHash": {"$exists": False}}]}
        )
        if legacy.deleted_count:
            logger.warning("Invalidated %d legacy plaintext sessions", legacy.deleted_count)
        try:
            await self.sessions.drop_index("token_1")
        except Exception:  # noqa: BLE001 - index only exists on older databases
            pass
        self._indexes_ready = True

    async def close(self) -> None:
        self.client.close()

    @staticmethod
    def _public_user(document: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": str(document["_id"]),
            "email": document["email"],
            "name": document.get("name", ""),
        }

    @staticmethod
    def _format_simulation(document: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": str(document["_id"]),
            "userId": stringify_object_id(document.get("userId")),
            "symbol": document["symbol"],
            "strategy": document["strategy"],
            "startingCapital": float(document["startingCapital"]),
            "status": document["status"],
            "notes": document.get("notes"),
            "createdAt": document["createdAt"],
        }

    @staticmethod
    def _format_training(document: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "user_id": stringify_object_id(document.get("userId")),
            "symbol": document["symbol"],
            "strategy_id": document["strategy_id"],
            "payload": document["payload"],
            "trained_at": document.get("trained_at"),
        }

    async def create_user(self, email: str, name: str, password: str) -> Dict[str, Any]:
        email_lower = email.lower()
        user_id = uuid.uuid4().hex
        record = {
            "_id": user_id,
            "email": email_lower,
            "name": name,
            "password_hash": pwd_context.hash(password),
            "createdAt": now().isoformat(),
        }
        try:
            await self.users.insert_one(record)
        except DuplicateKeyError as exc:
            raise ValueError("Email already registered") from exc
        return self._public_user(record)

    async def get_user_by_credentials(self, email: str, password: str) -> Optional[Dict[str, Any]]:
        email_lower = email.lower()
        record = await self.users.find_one({"email": email_lower})
        if not record:
            return None
        try:
            if not pwd_context.verify(password, record["password_hash"]):
                return None
        except ValueError:
            return None
        return self._public_user(record)

    async def ensure_user(self, email: str, name: str) -> Dict[str, Any]:
        email_lower = email.lower()
        record = await self.users.find_one({"email": email_lower})
        if record:
            return self._public_user(record)
        password = secrets.token_urlsafe(12)
        try:
            return await self.create_user(email, name, password)
        except ValueError:
            record = await self.users.find_one({"email": email_lower})
            if record:
                return self._public_user(record)
            raise

    async def create_session(self, user_id: str) -> Dict[str, Any]:
        token = generate_session_token()
        token_hash = hash_session_token(token)
        expiry = now() + timedelta(days=settings.session_duration_days)
        record = {
            "_id": token_hash,
            "tokenHash": token_hash,
            "userId": coerce_object_id(user_id),
            "expiresAt": expiry,
        }
        await self.sessions.insert_one(record)
        return {"token": token, "expires_at": expiry}

    async def delete_session(self, token: str) -> None:
        await self.sessions.delete_one({"_id": hash_session_token(token)})

    async def resolve_token(self, token: str) -> Optional[Dict[str, Any]]:
        record = await self.sessions.find_one({"_id": hash_session_token(token)})
        if not record:
            return None
        expires_at: Optional[datetime] = record.get("expiresAt")
        if isinstance(expires_at, str):
            try:
                expires_at = datetime.fromisoformat(expires_at)
            except ValueError:
                expires_at = None
        if isinstance(expires_at, datetime) and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
            await self.sessions.update_one(
                {"_id": record["_id"]},
                {"$set": {"expiresAt": expires_at}},
            )
        if expires_at is None or expires_at <= now():
            await self.sessions.delete_one({"_id": record["_id"]})
            return None
        user_id = record.get("userId")
        user = await self.users.find_one({"_id": user_id})
        if not user and isinstance(user_id, str):
            alternate = coerce_object_id(user_id)
            if alternate != user_id:
                user = await self.users.find_one({"_id": alternate})
        if not user:
            await self.sessions.delete_one({"_id": record["_id"]})
            return None
        return self._public_user(user)

    async def list_simulations(self, user_id: str) -> List[Dict[str, Any]]:
        cursor = (
            self.simulations.find({"userId": user_id})
            .sort("createdAt", DESCENDING or -1)
        )
        results: List[Dict[str, Any]] = []
        async for document in cursor:
            results.append(self._format_simulation(document))
        return results

    async def add_simulation(self, user_id: str, payload: SimulationInput) -> Dict[str, Any]:
        sim_id = uuid.uuid4().hex
        record = {
            "_id": sim_id,
            "userId": user_id,
            "symbol": payload.symbol.upper(),
            "strategy": payload.strategy,
            "startingCapital": float(payload.startingCapital),
            "status": "active",
            "notes": payload.notes,
            "createdAt": now().isoformat(),
        }
        await self.simulations.insert_one(record)
        return self._format_simulation(record)

    async def update_simulation(self, user_id: str, sim_id: str, payload: SimulationUpdate) -> Dict[str, Any]:
        updates: Dict[str, Any] = {}
        if payload.status is not None:
            updates["status"] = payload.status
        if payload.notes is not None:
            updates["notes"] = payload.notes
        if not updates:
            existing = await self.simulations.find_one({"_id": sim_id, "userId": user_id})
            if not existing:
                raise KeyError("Simulation not found")
            return self._format_simulation(existing)
        document = await self.simulations.find_one_and_update(
            {"_id": sim_id, "userId": user_id},
            {"$set": updates},
            return_document=ReturnDocument.AFTER,
        )
        if not document:
            raise KeyError("Simulation not found")
        return self._format_simulation(document)

    async def delete_simulation(self, user_id: str, sim_id: str) -> None:
        result = await self.simulations.delete_one({"_id": sim_id, "userId": user_id})
        if result.deleted_count == 0:
            raise KeyError("Simulation not found")

    async def record_training(self, user_id: str, symbol: str, strategy_id: str, payload: Dict[str, Any]) -> None:
        key = f"{user_id}:{symbol.upper()}"
        record = {
            "_id": key,
            "userId": user_id,
            "symbol": symbol.upper(),
            "strategy_id": strategy_id,
            "payload": payload,
            "trained_at": now().isoformat(),
        }
        await self.training.update_one({"_id": key}, {"$set": record}, upsert=True)

    async def get_training(self, user_id: str, symbol: str) -> Optional[Dict[str, Any]]:
        record = await self.training.find_one({"userId": user_id, "symbol": symbol.upper()})
        if not record:
            return None
        return self._format_training(record)

    async def list_trained(self, user_id: str) -> List[Dict[str, Any]]:
        cursor = self.training.find({"userId": user_id})
        results: List[Dict[str, Any]] = []
        async for document in cursor:
            results.append(self._format_training(document))
        return results

    @staticmethod
    def _format_backtest(document: Dict[str, Any]) -> Dict[str, Any]:
        record = {key: value for key, value in document.items() if key != "_id"}
        record["id"] = str(document["_id"])
        return record

    async def add_backtest(self, user_id: str, record: Dict[str, Any]) -> Dict[str, Any]:
        backtest_id = uuid.uuid4().hex
        document = record | {"_id": backtest_id, "userId": user_id, "createdAt": now().isoformat()}
        await self.backtests.insert_one(document)
        return self._format_backtest(document)

    async def get_backtest(self, user_id: str, backtest_id: str) -> Optional[Dict[str, Any]]:
        document = await self.backtests.find_one({"_id": backtest_id, "userId": user_id})
        return self._format_backtest(document) if document else None

    async def list_backtests(self, user_id: str) -> List[Dict[str, Any]]:
        projection = {"equity": 0, "drawdown": 0, "buyHold": 0, "benchmarkEquity": 0, "trades": 0, "risk.drawdown": 0, "risk.buyHold": 0, "risk.benchmark": 0}
        cursor = self.backtests.find({"userId": user_id}, projection).sort("createdAt", DESCENDING or -1)
        return [backtest_summary(self._format_backtest(document)) async for document in cursor]

    async def add_model(self, user_id: str, record: Dict[str, Any], artifact: bytes) -> Dict[str, Any]:
        if self.artifacts is None:  # pragma: no cover - motor always ships GridFS
            raise RuntimeError("GridFS is unavailable")
        model_id = uuid.uuid4().hex
        artifact_id = await self.artifacts.upload_from_stream(f"{model_id}.joblib", artifact, metadata={"userId": user_id})
        document = record | {"_id": model_id, "userId": user_id, "artifactId": artifact_id}
        await self.models.insert_one(document)
        return self._format_model(document)

    @staticmethod
    def _format_model(document: Dict[str, Any]) -> Dict[str, Any]:
        record = {key: value for key, value in document.items() if key not in ("_id",)}
        record["id"] = str(document["_id"])
        record["artifactId"] = str(document.get("artifactId"))
        return record

    async def get_model(self, user_id: str, model_id: str) -> Optional[Dict[str, Any]]:
        document = await self.models.find_one({"_id": model_id, "userId": user_id})
        if not document:
            return None
        record = self._format_model(document)
        record["_artifactObjectId"] = document.get("artifactId")
        return record

    async def list_models(self, user_id: str) -> List[Dict[str, Any]]:
        projection = {"strategy.equity": 0, "strategy.buyHold": 0, "strategy.trades": 0, "labelDistribution": 0}
        cursor = self.models.find({"userId": user_id}, projection).sort("trainedAt", DESCENDING or -1)
        return [model_summary(self._format_model(document)) async for document in cursor]

    async def latest_model(self, user_id: str, symbol: str) -> Optional[Dict[str, Any]]:
        document = await self.models.find_one({"userId": user_id, "symbol": symbol.upper()}, sort=[("trainedAt", DESCENDING or -1)])
        if not document:
            return None
        record = self._format_model(document)
        record["_artifactObjectId"] = document.get("artifactId")
        return record

    async def get_artifact(self, record: Dict[str, Any]) -> Optional[bytes]:
        if self.artifacts is None or record.get("_artifactObjectId") is None:
            return None
        stream = await self.artifacts.open_download_stream(record["_artifactObjectId"])
        return await stream.read()


Store = Union[InMemoryStore, MongoStore]


class StoreUnavailableError(RuntimeError):
    """Raised when strict database mode forbids falling back to the in-memory store."""


# The store is created lazily on first use and cached for the life of the process, so the
# app never depends on startup hooks (serverless cold starts don't guarantee them). The
# event loop is remembered because Motor clients are bound to the loop that created them.
_store: Optional[Store] = None
_store_loop: Optional[asyncio.AbstractEventLoop] = None
_store_lock: Optional[asyncio.Lock] = None


def _in_memory_fallback(reason: str) -> InMemoryStore:
    if settings.strict_db:
        raise StoreUnavailableError(reason)
    logger.warning("%s; using ephemeral in-memory store (set STRICT_DB=true to fail instead)", reason)
    return InMemoryStore()


async def _create_store() -> Store:
    if settings.use_in_memory_db:
        if ON_VERCEL:
            logger.warning("USE_IN_MEMORY_DB is set on serverless hosting; data will not persist between requests")
        else:
            logger.info("Using in-memory data store")
        return InMemoryStore()
    mongo_dsn = resolve_mongo_dsn(settings)
    if not mongo_dsn:
        return _in_memory_fallback("MongoDB connection string not provided")
    if AsyncIOMotorClient is None or DuplicateKeyError is None or ASCENDING is None or ReturnDocument is None:
        return _in_memory_fallback("MongoDB dependencies are unavailable")
    mongo_store = MongoStore(mongo_dsn, settings.mongodb_db)
    try:
        await mongo_store.init()
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to initialise MongoDB store at %s: %s", mask_mongo_dsn(mongo_dsn), exc)
        await mongo_store.close()
        return _in_memory_fallback("MongoDB is unreachable")
    logger.info("Connected to MongoDB at %s", mask_mongo_dsn(mongo_dsn))
    return mongo_store


async def get_store() -> Store:
    global _store, _store_loop, _store_lock
    loop = asyncio.get_running_loop()
    if _store is not None and _store_loop is loop:
        return _store
    if _store_lock is None or _store_loop is not loop:
        _store_lock = asyncio.Lock()
    async with _store_lock:
        if _store is None or _store_loop is not loop:
            try:
                _store = await _create_store()
            except StoreUnavailableError as exc:
                logger.error("Data store unavailable (strict mode): %s", exc)
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Data store unavailable. Please try again shortly.",
                ) from exc
            _store_loop = loop
    return _store


async def get_current_user(
    authorization: str = Header(""),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    user = await store.resolve_token(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
    return user | {"token": token}


signup_rate_limit = rate_limit("auth-signup", settings.auth_rate_limit_per_minute)
login_rate_limit = rate_limit("auth-login", settings.auth_rate_limit_per_minute)
dev_auth_rate_limit = rate_limit("auth-dev", settings.auth_rate_limit_per_minute)
market_rate_limit = rate_limit("market", settings.market_rate_limit_per_minute)
SymbolPath = Annotated[str, Path(pattern=SYMBOL_PATTERN)]


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


@router.get("/simulations")
async def list_simulations(user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> List[Dict[str, Any]]:
    return await store.list_simulations(user["id"])


@router.post("/simulations")
async def create_simulation(payload: SimulationInput, user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    return await store.add_simulation(user["id"], payload)


@router.patch("/simulations/{sim_id}")
async def patch_simulation(
    sim_id: str,
    payload: SimulationUpdate,
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    try:
        return await store.update_simulation(user["id"], sim_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Simulation not found") from exc


@router.delete("/simulations/{sim_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def remove_simulation(sim_id: str, user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Response:
    try:
        await store.delete_simulation(user["id"], sim_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Simulation not found") from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
        simulation = await store.add_simulation(user["id"], SimulationInput(**payload.params))
        return {"action": payload.action, "id": simulation["id"], "path": "/simulations", "simulation": simulation}
    except ValidationError as exc:
        first = exc.errors()[0]
        raise HTTPException(status_code=422, detail=f"Invalid {'.'.join(str(p) for p in first.get('loc', ()))}: {first.get('msg')}") from exc
    except ActionError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc


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


@router.get("/status")
async def system_status(
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    """Operational snapshot for the console. Never includes DSNs, keys, or error text."""
    _ = user
    return {
        "version": app.version,
        "serverTime": now().isoformat(),
        "store": "mongo" if isinstance(store, MongoStore) else "memory",
        "strictDb": settings.strict_db,
        "devEndpoints": dev_endpoints_enabled(),
        "copilotConfigured": copilot_service.configured(),
        "experimentTracking": experiment_tracking.enabled(),
        "offlineMarketDataAllowed": settings.allow_offline_market_data,
        "marketData": dict(MARKET_HEALTH),
        "rateLimits": {
            "authPerMinute": settings.auth_rate_limit_per_minute,
            "marketPerMinute": settings.market_rate_limit_per_minute,
            "shared": not settings.rate_limit_storage_uri.startswith("memory://"),
        },
    }


@router.get("/health")
async def health() -> Dict[str, Any]:
    return {"status": "ok", "timestamp": now().isoformat()}


app.include_router(router)
