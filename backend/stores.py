"""Persistence: an in-memory store for development/tests and a MongoDB store for production.
Both implement the same interface (users, sessions, simulations, training, backtests, models,
research notes)."""

from __future__ import annotations

import asyncio
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Union

from backend.config import settings
from backend.models.simulation import SIMULATION_CURRENCY, SimulationInput, SimulationUpdate
from backend.security import pwd_context
from backend.services.auth_tokens import generate_session_token, hash_session_token
from backend.services.clock import now

import logging

logger = logging.getLogger("algo_trade_backend.stores")

try:
    from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
    from pymongo import ASCENDING, DESCENDING, ReturnDocument
    from pymongo.errors import DuplicateKeyError
    from bson import ObjectId  # type: ignore[attr-defined]
except ModuleNotFoundError:  # pragma: no cover - optional dependency
    AsyncIOMotorClient = None
    AsyncIOMotorGridFSBucket = None
    ASCENDING = DESCENDING = ReturnDocument = None
    DuplicateKeyError = None
    ObjectId = None


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


NOTE_VECTOR_FIELDS = ("id", "title", "body", "kind", "refId", "symbol", "createdAt", "embedding", "embeddingModel")


# Simulation fields beyond the base record: the frozen strategy config and lifecycle written by
# services/simulation_service.py. Anything else passed to the store is dropped.
SIMULATION_EXTRA_FIELDS = ("params", "config", "startedAt", "statusHistory", "engineVersion", "finalReport")
SIMULATION_MUTABLE_FIELDS = SIMULATION_EXTRA_FIELDS + ("status", "notes", "strategy")


def _simulation_extra(extra: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    return {key: value for key, value in (extra or {}).items() if key in SIMULATION_EXTRA_FIELDS}


def _simulation_fields(fields: Dict[str, Any]) -> Dict[str, Any]:
    return {key: value for key, value in fields.items() if key in SIMULATION_MUTABLE_FIELDS}


# Portfolio holdings: only allowlisted, server-resolved instrument fields are ever stored.
HOLDING_FIELDS = ("symbol", "isin", "schemeCode", "name", "exchange", "currency", "type", "sector", "assetType", "quantity", "avgCost", "buyDate")
IMPORT_FIELDS = ("source", "rowCount")


def _pick(record: Dict[str, Any], fields: tuple) -> Dict[str, Any]:
    return {key: record.get(key) for key in fields}


def public_note(record: Dict[str, Any]) -> Dict[str, Any]:
    """A note without its embedding (vectors never leave the server)."""
    note = {key: value for key, value in record.items() if key not in ("embedding", "userId", "_id")}
    note["indexed"] = bool(record.get("embedding"))
    return note


def backtest_summary(record: Dict[str, Any]) -> Dict[str, Any]:
    summary = {key: record.get(key) for key in BACKTEST_SUMMARY_FIELDS}
    metrics = (record.get("risk") or {}).get("metrics") or {}
    summary["riskHeadline"] = {key: metrics.get(key) for key in RISK_HEADLINE_FIELDS} if metrics else None
    return summary


# Fields a research run may gain after it is saved (everything else is immutable).
RESEARCH_RUN_EXTRA_FIELDS = frozenset({"comparisonId", "tracking", "lastReplay"})


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
        self.notes: Dict[str, Dict[str, Any]] = {}
        self.portfolio_imports: Dict[str, Dict[str, Any]] = {}
        self.holdings: Dict[str, Dict[str, Any]] = {}
        self.market_flows: Dict[str, Dict[str, Any]] = {}
        self.research_datasets: Dict[str, Dict[str, Any]] = {}
        self.research_blobs: Dict[str, bytes] = {}
        self.research_runs: Dict[str, Dict[str, Any]] = {}
        self.ranking_experiments: Dict[str, Dict[str, Any]] = {}

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
            records = [record | {"currency": SIMULATION_CURRENCY} for record in self.simulations.values() if record["userId"] == user_id]
        # Newest first, matching MongoStore's sort (store parity).
        return sorted(records, key=lambda record: record["createdAt"], reverse=True)

    async def add_simulation(
        self,
        user_id: str,
        payload: SimulationInput,
        extra: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        async with self.lock:
            sim_id = uuid.uuid4().hex
            record = {
                "id": sim_id,
                "userId": user_id,
                "symbol": payload.symbol.upper(),
                "strategy": payload.strategy,
                "startingCapital": float(payload.startingCapital),
                "currency": SIMULATION_CURRENCY,
                "status": "active",
                "notes": payload.notes,
                "createdAt": now().isoformat(),
            } | _simulation_extra(extra)
            self.simulations[sim_id] = record
            return dict(record)

    async def get_simulation(self, user_id: str, sim_id: str) -> Optional[Dict[str, Any]]:
        async with self.lock:
            record = self.simulations.get(sim_id)
            if not record or record["userId"] != user_id:
                return None
            return record | {"currency": SIMULATION_CURRENCY}

    async def set_simulation_fields(self, user_id: str, sim_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
        async with self.lock:
            record = self.simulations.get(sim_id)
            if not record or record["userId"] != user_id:
                raise KeyError("Simulation not found")
            record.update(_simulation_fields(fields))
            return record | {"currency": SIMULATION_CURRENCY}

    async def update_simulation(self, user_id: str, sim_id: str, payload: SimulationUpdate) -> Dict[str, Any]:
        async with self.lock:
            record = self.simulations.get(sim_id)
            if not record or record["userId"] != user_id:
                raise KeyError("Simulation not found")
            record["currency"] = SIMULATION_CURRENCY
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

    async def add_note(self, user_id: str, record: Dict[str, Any]) -> Dict[str, Any]:
        async with self.lock:
            stored = record | {"id": uuid.uuid4().hex, "userId": user_id, "createdAt": now().isoformat()}
            self.notes[stored["id"]] = stored
            return stored

    async def get_note(self, user_id: str, note_id: str) -> Optional[Dict[str, Any]]:
        async with self.lock:
            record = self.notes.get(note_id)
            return record if record and record["userId"] == user_id else None

    async def find_note(self, user_id: str, kind: str, ref_id: str) -> Optional[Dict[str, Any]]:
        async with self.lock:
            return next((r for r in self.notes.values() if r["userId"] == user_id and r.get("kind") == kind and r.get("refId") == ref_id), None)

    async def list_notes(self, user_id: str, kind: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        async with self.lock:
            records = [r for r in self.notes.values() if r["userId"] == user_id and (kind is None or r.get("kind") == kind)]
        records.sort(key=lambda r: r["createdAt"], reverse=True)
        return records[:limit]

    async def delete_note(self, user_id: str, note_id: str) -> bool:
        async with self.lock:
            record = self.notes.get(note_id)
            if not record or record["userId"] != user_id:
                return False
            del self.notes[note_id]
            return True

    async def add_portfolio_import(self, user_id: str, record: Dict[str, Any], holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
        async with self.lock:
            import_id = uuid.uuid4().hex
            created = now().isoformat()
            stored_import = {"id": import_id, "userId": user_id, "createdAt": created} | _pick(record, IMPORT_FIELDS)
            self.portfolio_imports[import_id] = stored_import
            stored = []
            for holding in holdings:
                holding_id = uuid.uuid4().hex
                row = {"id": holding_id, "userId": user_id, "importId": import_id, "createdAt": created} | _pick(holding, HOLDING_FIELDS)
                self.holdings[holding_id] = row
                stored.append(dict(row))
            return {"import": dict(stored_import), "holdings": stored}

    async def list_portfolio(self, user_id: str) -> Dict[str, List[Dict[str, Any]]]:
        async with self.lock:
            imports = sorted((dict(r) for r in self.portfolio_imports.values() if r["userId"] == user_id), key=lambda r: r["createdAt"], reverse=True)
            holdings = sorted((dict(r) for r in self.holdings.values() if r["userId"] == user_id), key=lambda r: (r["createdAt"], r["id"]))
        return {"imports": imports, "holdings": holdings}

    async def delete_portfolio_import(self, user_id: str, import_id: str) -> int:
        async with self.lock:
            record = self.portfolio_imports.get(import_id)
            if not record or record["userId"] != user_id:
                raise KeyError("Import not found")
            del self.portfolio_imports[import_id]
            doomed = [key for key, row in self.holdings.items() if row["userId"] == user_id and row["importId"] == import_id]
            for key in doomed:
                del self.holdings[key]
            return len(doomed)

    # Market flows are public market data shared by all users (no user fields).
    async def upsert_flow_snapshot(self, kind: str, day: str, data: Dict[str, Any], source: str) -> None:
        async with self.lock:
            self.market_flows[f"{kind}:{day}"] = {"kind": kind, "date": day, "data": data, "source": source, "storedAt": now().isoformat()}

    # Research runs and comparisons (Phase 13b): user-scoped.
    async def add_research_run(self, user_id: str, record: Dict[str, Any]) -> Dict[str, Any]:
        async with self.lock:
            stored = record | {"id": uuid.uuid4().hex, "userId": user_id, "createdAt": now().isoformat()}
            self.research_runs[stored["id"]] = stored
            return stored

    async def get_research_run(self, user_id: str, run_id: str) -> Optional[Dict[str, Any]]:
        async with self.lock:
            record = self.research_runs.get(run_id)
            return record if record and record["userId"] == user_id else None

    async def list_research_runs(self, user_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        from backend.services.research_runs import summarize

        async with self.lock:
            records = [r for r in self.research_runs.values() if r["userId"] == user_id]
        records.sort(key=lambda r: r["createdAt"], reverse=True)
        return [summarize(r) for r in records[:limit]]

    async def set_research_run_fields(self, user_id: str, run_id: str, fields: Dict[str, Any]) -> None:
        allowed = {key: value for key, value in fields.items() if key in RESEARCH_RUN_EXTRA_FIELDS}
        async with self.lock:
            record = self.research_runs.get(run_id)
            if record and record["userId"] == user_id:
                record.update(allowed)

    async def set_research_run_comparison(self, user_id: str, run_id: str, comparison_id: str) -> None:
        await self.set_research_run_fields(user_id, run_id, {"comparisonId": comparison_id})

    # Ranking experiments (Phase 13d): shared research models written by the training script.
    async def add_ranking_experiment(self, record: Dict[str, Any], artifacts: Dict[str, bytes]) -> Dict[str, Any]:
        async with self.lock:
            experiment_id = uuid.uuid4().hex
            for family, data in artifacts.items():
                self.research_blobs[f"ranking:{experiment_id}:{family}"] = data
            stored = record | {"id": experiment_id, "storedAt": now().isoformat(), "artifactFamilies": sorted(artifacts)}
            self.ranking_experiments[experiment_id] = stored
            return stored

    async def get_ranking_experiment(self, experiment_id: str) -> Optional[Dict[str, Any]]:
        async with self.lock:
            return self.ranking_experiments.get(experiment_id)

    async def list_ranking_experiments(self) -> List[Dict[str, Any]]:
        async with self.lock:
            records = list(self.ranking_experiments.values())
        return sorted(records, key=lambda r: r["storedAt"], reverse=True)

    async def get_ranking_artifact(self, experiment_id: str, family: str) -> Optional[bytes]:
        async with self.lock:
            return self.research_blobs.get(f"ranking:{experiment_id}:{family}")

    # Research datasets (Phase 13): shared, immutable snapshots keyed by content version.
    async def add_research_dataset(self, meta: Dict[str, Any], blob: bytes) -> Dict[str, Any]:
        async with self.lock:
            version = meta["version"]
            if version not in self.research_datasets:
                self.research_blobs[version] = blob
                self.research_datasets[version] = meta | {"storedAt": now().isoformat(), "sizeBytes": len(blob)}
            return self.research_datasets[version]

    async def get_research_dataset(self, version: str) -> Optional[Dict[str, Any]]:
        async with self.lock:
            return self.research_datasets.get(version)

    async def list_research_datasets(self) -> List[Dict[str, Any]]:
        async with self.lock:
            records = list(self.research_datasets.values())
        return sorted(records, key=lambda r: r["storedAt"], reverse=True)

    async def get_research_dataset_blob(self, version: str) -> Optional[bytes]:
        async with self.lock:
            return self.research_blobs.get(version)

    async def list_flow_snapshots(self, kind: str, limit: int = 60) -> List[Dict[str, Any]]:
        async with self.lock:
            records = [dict(record) for record in self.market_flows.values() if record["kind"] == kind]
        return sorted(records, key=lambda record: record["date"], reverse=True)[:limit]

    async def delete_portfolio(self, user_id: str) -> int:
        async with self.lock:
            for key in [key for key, row in self.portfolio_imports.items() if row["userId"] == user_id]:
                del self.portfolio_imports[key]
            doomed = [key for key, row in self.holdings.items() if row["userId"] == user_id]
            for key in doomed:
                del self.holdings[key]
            return len(doomed)

    async def note_vectors(self, user_id: str, limit: int = 2000) -> List[Dict[str, Any]]:
        async with self.lock:
            records = [r for r in self.notes.values() if r["userId"] == user_id]
        records.sort(key=lambda r: r["createdAt"], reverse=True)
        return [{key: r.get(key) for key in NOTE_VECTOR_FIELDS} for r in records[:limit]]

    async def set_note_embedding(self, user_id: str, note_id: str, embedding: List[float], model: str) -> None:
        async with self.lock:
            record = self.notes.get(note_id)
            if record and record["userId"] == user_id:
                record["embedding"], record["embeddingModel"] = embedding, model


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
        self.notes = self.db["research_notes"]
        self.portfolio_imports = self.db["portfolio_imports"]
        self.holdings = self.db["holdings"]
        self.market_flows = self.db["market_flows"]
        self.research_datasets = self.db["research_datasets"]
        self.research_runs = self.db["research_runs"]
        self.ranking_experiments = self.db["ranking_experiments"]
        # Model artifacts live in GridFS (never on local disk: serverless filesystems are ephemeral).
        self.artifacts = AsyncIOMotorGridFSBucket(self.db, bucket_name="model_artifacts") if AsyncIOMotorGridFSBucket else None
        self.research_snapshots = AsyncIOMotorGridFSBucket(self.db, bucket_name="research_snapshots") if AsyncIOMotorGridFSBucket else None
        self.ranking_models = AsyncIOMotorGridFSBucket(self.db, bucket_name="ranking_models") if AsyncIOMotorGridFSBucket else None
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
        await self.notes.create_index([("userId", ASCENDING or 1), ("createdAt", DESCENDING or -1)])
        await self.notes.create_index([("userId", ASCENDING or 1), ("kind", ASCENDING or 1), ("refId", ASCENDING or 1)])
        await self.portfolio_imports.create_index([("userId", ASCENDING or 1), ("createdAt", DESCENDING or -1)])
        await self.holdings.create_index([("userId", ASCENDING or 1), ("importId", ASCENDING or 1)])
        await self.market_flows.create_index([("kind", ASCENDING or 1), ("date", DESCENDING or -1)])
        await self.research_runs.create_index([("userId", ASCENDING or 1), ("createdAt", DESCENDING or -1)])
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
            "currency": SIMULATION_CURRENCY,
            "status": document["status"],
            "notes": document.get("notes"),
            "createdAt": document["createdAt"],
        } | {key: document[key] for key in SIMULATION_EXTRA_FIELDS if key in document}

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

    async def add_simulation(self, user_id: str, payload: SimulationInput, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        sim_id = uuid.uuid4().hex
        record = {
            "_id": sim_id,
            "userId": user_id,
            "symbol": payload.symbol.upper(),
            "strategy": payload.strategy,
            "startingCapital": float(payload.startingCapital),
            "currency": SIMULATION_CURRENCY,
            "status": "active",
            "notes": payload.notes,
            "createdAt": now().isoformat(),
        } | _simulation_extra(extra)
        await self.simulations.insert_one(record)
        return self._format_simulation(record)

    async def get_simulation(self, user_id: str, sim_id: str) -> Optional[Dict[str, Any]]:
        document = await self.simulations.find_one({"_id": sim_id, "userId": user_id})
        return self._format_simulation(document) if document else None

    async def set_simulation_fields(self, user_id: str, sim_id: str, fields: Dict[str, Any]) -> Dict[str, Any]:
        document = await self.simulations.find_one_and_update(
            {"_id": sim_id, "userId": user_id},
            {"$set": _simulation_fields(fields)},
            return_document=ReturnDocument.AFTER,
        )
        if not document:
            raise KeyError("Simulation not found")
        return self._format_simulation(document)

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

    @staticmethod
    def _format_note(document: Dict[str, Any]) -> Dict[str, Any]:
        record = {key: value for key, value in document.items() if key != "_id"}
        record["id"] = str(document["_id"])
        return record

    async def add_note(self, user_id: str, record: Dict[str, Any]) -> Dict[str, Any]:
        document = record | {"_id": uuid.uuid4().hex, "userId": user_id, "createdAt": now().isoformat()}
        await self.notes.insert_one(document)
        return self._format_note(document)

    async def get_note(self, user_id: str, note_id: str) -> Optional[Dict[str, Any]]:
        document = await self.notes.find_one({"_id": note_id, "userId": user_id})
        return self._format_note(document) if document else None

    async def find_note(self, user_id: str, kind: str, ref_id: str) -> Optional[Dict[str, Any]]:
        document = await self.notes.find_one({"userId": user_id, "kind": kind, "refId": ref_id})
        return self._format_note(document) if document else None

    async def list_notes(self, user_id: str, kind: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {"userId": user_id}
        if kind:
            query["kind"] = kind
        cursor = self.notes.find(query, {"embedding": 0}).sort("createdAt", DESCENDING or -1).limit(limit)
        # The projection drops the vector; keep a truthy marker so public_note still reports "indexed".
        return [self._format_note(document) | {"embedding": bool(document.get("embeddingModel"))} async for document in cursor]

    async def delete_note(self, user_id: str, note_id: str) -> bool:
        result = await self.notes.delete_one({"_id": note_id, "userId": user_id})
        return result.deleted_count == 1

    @staticmethod
    def _format_plain(document: Dict[str, Any]) -> Dict[str, Any]:
        return {"id": str(document["_id"])} | {key: value for key, value in document.items() if key != "_id"}

    async def add_portfolio_import(self, user_id: str, record: Dict[str, Any], holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
        import_id = uuid.uuid4().hex
        created = now().isoformat()
        stored_import = {"_id": import_id, "userId": user_id, "createdAt": created} | _pick(record, IMPORT_FIELDS)
        rows = [
            {"_id": uuid.uuid4().hex, "userId": user_id, "importId": import_id, "createdAt": created} | _pick(holding, HOLDING_FIELDS)
            for holding in holdings
        ]
        await self.portfolio_imports.insert_one(stored_import)
        if rows:
            await self.holdings.insert_many(rows)
        return {"import": self._format_plain(stored_import), "holdings": [self._format_plain(row) for row in rows]}

    async def list_portfolio(self, user_id: str) -> Dict[str, List[Dict[str, Any]]]:
        imports = [self._format_plain(doc) async for doc in self.portfolio_imports.find({"userId": user_id}).sort("createdAt", DESCENDING or -1)]
        holdings = [self._format_plain(doc) async for doc in self.holdings.find({"userId": user_id}).sort([("createdAt", ASCENDING or 1), ("_id", ASCENDING or 1)])]
        return {"imports": imports, "holdings": holdings}

    async def delete_portfolio_import(self, user_id: str, import_id: str) -> int:
        result = await self.portfolio_imports.delete_one({"_id": import_id, "userId": user_id})
        if result.deleted_count == 0:
            raise KeyError("Import not found")
        removed = await self.holdings.delete_many({"userId": user_id, "importId": import_id})
        return removed.deleted_count

    async def upsert_flow_snapshot(self, kind: str, day: str, data: Dict[str, Any], source: str) -> None:
        record = {"kind": kind, "date": day, "data": data, "source": source, "storedAt": now().isoformat()}
        await self.market_flows.update_one({"_id": f"{kind}:{day}"}, {"$set": record}, upsert=True)

    # Research runs and comparisons (Phase 13b): user-scoped documents (lists are capped by the service).
    async def add_research_run(self, user_id: str, record: Dict[str, Any]) -> Dict[str, Any]:
        run_id = uuid.uuid4().hex
        document = record | {"_id": run_id, "userId": user_id, "createdAt": now().isoformat()}
        await self.research_runs.insert_one(document)
        return self._format_plain(document) | {"id": run_id}

    async def get_research_run(self, user_id: str, run_id: str) -> Optional[Dict[str, Any]]:
        document = await self.research_runs.find_one({"_id": run_id, "userId": user_id})
        return self._format_plain(document) | {"id": run_id} if document else None

    async def list_research_runs(self, user_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        from backend.services.research_runs import summarize

        projection = {"fills": 0, "holdings": 0, "decisions": 0, "series": 0, "orderEvents": 0, "dividends": 0, "feeSchedule": 0}
        cursor = self.research_runs.find({"userId": user_id}, projection).sort("createdAt", DESCENDING or -1).limit(limit)
        return [summarize(self._format_plain(document) | {"id": document["_id"]}) async for document in cursor]

    async def set_research_run_fields(self, user_id: str, run_id: str, fields: Dict[str, Any]) -> None:
        allowed = {key: value for key, value in fields.items() if key in RESEARCH_RUN_EXTRA_FIELDS}
        if allowed:
            await self.research_runs.update_one({"_id": run_id, "userId": user_id}, {"$set": allowed})

    async def set_research_run_comparison(self, user_id: str, run_id: str, comparison_id: str) -> None:
        await self.set_research_run_fields(user_id, run_id, {"comparisonId": comparison_id})

    # Ranking experiments (Phase 13d): shared documents; fitted models in GridFS `ranking_models`.
    async def add_ranking_experiment(self, record: Dict[str, Any], artifacts: Dict[str, bytes]) -> Dict[str, Any]:
        if self.ranking_models is None:  # pragma: no cover - motor always ships GridFS
            raise RuntimeError("GridFS is unavailable")
        experiment_id = uuid.uuid4().hex
        artifact_ids = {}
        for family, data in artifacts.items():
            artifact_ids[family] = await self.ranking_models.upload_from_stream(f"{experiment_id}-{family}.joblib", data, metadata={"experiment": experiment_id})
        document = record | {"_id": experiment_id, "storedAt": now().isoformat(), "artifactFamilies": sorted(artifacts), "artifactIds": artifact_ids}
        await self.ranking_experiments.insert_one(document)
        return self._format_experiment(document)

    @staticmethod
    def _format_experiment(document: Dict[str, Any]) -> Dict[str, Any]:
        return {"id": str(document["_id"])} | {key: value for key, value in document.items() if key not in ("_id", "artifactIds")}

    async def get_ranking_experiment(self, experiment_id: str) -> Optional[Dict[str, Any]]:
        document = await self.ranking_experiments.find_one({"_id": experiment_id})
        return self._format_experiment(document) if document else None

    async def list_ranking_experiments(self) -> List[Dict[str, Any]]:
        cursor = self.ranking_experiments.find({}, {"predictions": 0, "validationTrading": 0, "holdoutTrading": 0, "trials": 0}).sort("storedAt", DESCENDING or -1)
        return [self._format_experiment(document) async for document in cursor]

    async def get_ranking_artifact(self, experiment_id: str, family: str) -> Optional[bytes]:
        document = await self.ranking_experiments.find_one({"_id": experiment_id}, {"artifactIds": 1})
        blob_id = (document or {}).get("artifactIds", {}).get(family)
        if blob_id is None or self.ranking_models is None:
            return None
        stream = await self.ranking_models.open_download_stream(blob_id)
        return await stream.read()

    # Research datasets (Phase 13): metadata document + snapshot bytes in GridFS.
    async def add_research_dataset(self, meta: Dict[str, Any], blob: bytes) -> Dict[str, Any]:
        if self.research_snapshots is None:  # pragma: no cover - motor always ships GridFS
            raise RuntimeError("GridFS is unavailable")
        version = meta["version"]
        existing = await self.get_research_dataset(version)
        if existing is not None:
            return existing
        blob_id = await self.research_snapshots.upload_from_stream(f"{version}.npz", blob, metadata={"version": version})
        document = meta | {"_id": version, "blobId": blob_id, "storedAt": now().isoformat(), "sizeBytes": len(blob)}
        await self.research_datasets.insert_one(document)
        return self._format_dataset(document)

    @staticmethod
    def _format_dataset(document: Dict[str, Any]) -> Dict[str, Any]:
        return {key: value for key, value in document.items() if key not in ("_id", "blobId")}

    async def get_research_dataset(self, version: str) -> Optional[Dict[str, Any]]:
        document = await self.research_datasets.find_one({"_id": version})
        return self._format_dataset(document) if document else None

    async def list_research_datasets(self) -> List[Dict[str, Any]]:
        cursor = self.research_datasets.find({}, {"coverage": 0}).sort("storedAt", DESCENDING or -1)
        return [self._format_dataset(document) async for document in cursor]

    async def get_research_dataset_blob(self, version: str) -> Optional[bytes]:
        document = await self.research_datasets.find_one({"_id": version}, {"blobId": 1})
        if not document or self.research_snapshots is None:
            return None
        stream = await self.research_snapshots.open_download_stream(document["blobId"])
        return await stream.read()

    async def list_flow_snapshots(self, kind: str, limit: int = 60) -> List[Dict[str, Any]]:
        cursor = self.market_flows.find({"kind": kind}, {"_id": 0}).sort("date", DESCENDING or -1).limit(limit)
        return [document async for document in cursor]

    async def delete_portfolio(self, user_id: str) -> int:
        await self.portfolio_imports.delete_many({"userId": user_id})
        removed = await self.holdings.delete_many({"userId": user_id})
        return removed.deleted_count

    async def note_vectors(self, user_id: str, limit: int = 2000) -> List[Dict[str, Any]]:
        projection = {key: 1 for key in NOTE_VECTOR_FIELDS if key != "id"}
        cursor = self.notes.find({"userId": user_id}, projection).sort("createdAt", DESCENDING or -1).limit(limit)
        return [self._format_note(document) async for document in cursor]

    async def set_note_embedding(self, user_id: str, note_id: str, embedding: List[float], model: str) -> None:
        await self.notes.update_one({"_id": note_id, "userId": user_id}, {"$set": {"embedding": embedding, "embeddingModel": model}})

    async def vector_search_notes(self, user_id: str, vector: List[float], k: int, model: str, index: str) -> List[Dict[str, Any]]:
        """Atlas Vector Search filtered to this user and embedding model. Atlas reports
        (1 + cosine) / 2 for cosine indexes; converted back to cosine similarity here."""
        pipeline = [
            {"$vectorSearch": {"index": index, "path": "embedding", "queryVector": vector, "numCandidates": max(50, k * 10), "limit": k, "filter": {"userId": user_id, "embeddingModel": model}}},
            {"$project": {"embedding": 0, "score": {"$meta": "vectorSearchScore"}}},
        ]
        results = []
        async for document in self.notes.aggregate(pipeline):
            record = self._format_note(document)
            record["score"] = 2 * float(record.pop("score", 0.5)) - 1
            results.append(record)
        return results


Store = Union[InMemoryStore, MongoStore]
