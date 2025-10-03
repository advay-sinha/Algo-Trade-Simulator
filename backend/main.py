from __future__ import annotations

import asyncio
import datetime as dt
import os
import secrets
from typing import Annotated, Any, Dict, List, Optional
from types import SimpleNamespace

import yfinance as yf
import requests
from bson import ObjectId
from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

TRUTHY_ENV_VALUES = {"1", "true", "yes", "on"}


def env_flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in TRUTHY_ENV_VALUES


DATABASE_NAME = os.getenv("MONGODB_DB", "algo-trade-simulator")
MONGO_URL = os.getenv("MONGO_URL")
MONGO_URI_ALIAS = os.getenv("MONGO_URI")
MONGODB_URI_ENV = os.getenv("MONGODB_URI")
_raw_mongodb_uri = MONGO_URL or MONGODB_URI_ENV or MONGO_URI_ALIAS
MONGODB_URI = _raw_mongodb_uri or "mongodb://localhost:27017"
USE_IN_MEMORY_DB = env_flag("USE_IN_MEMORY_DB") or MONGODB_URI.startswith("memory://")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
ENABLE_DEV_ENDPOINTS = env_flag("ENABLE_DEV_ENDPOINTS")
try:
    session_days = float(os.getenv("SESSION_DURATION_DAYS", "7"))
except ValueError:
    session_days = 7.0

SESSION_DURATION = dt.timedelta(days=session_days)
DEFAULT_WATCHLIST = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA"]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class InMemoryInsertOneResult(SimpleNamespace):
    inserted_id: ObjectId


if USE_IN_MEMORY_DB:

    class InMemoryUpdateResult(SimpleNamespace):
        matched_count: int
        modified_count: int

    class InMemoryDeleteResult(SimpleNamespace):
        deleted_count: int

    class InMemoryCursor:
        def __init__(self, documents: List[Dict[str, Any]]):
            self._documents = [doc.copy() for doc in documents]

        def sort(self, key, direction=None):
            if isinstance(key, list):
                sort_fields = key
            else:
                sort_fields = [(key, direction or 1)]

            for field, order in reversed(sort_fields):
                self._documents.sort(key=lambda item: item.get(field), reverse=order == -1)

            return self

        async def to_list(self, length: Optional[int] = None) -> List[Dict[str, Any]]:
            if length is None:
                return [doc.copy() for doc in self._documents]
            return [doc.copy() for doc in self._documents[:length]]

    class InMemoryCollection:
        def __init__(self, name: str):
            self.name = name
            self._documents: List[Dict[str, Any]] = []
            self._unique_fields: set[str] = set()

        async def create_index(self, keys, unique: bool = False, **kwargs) -> str:
            if isinstance(keys, str):
                fields = [keys]
            elif isinstance(keys, tuple):
                fields = [keys[0]]
            else:
                fields = [item[0] if isinstance(item, (tuple, list)) else item for item in keys]

            if unique:
                self._unique_fields.update(fields)

            return "_".join(fields) or f"{self.name}_idx"

        def _matches(self, document: Dict[str, Any], filter: Optional[Dict[str, Any]]) -> bool:
            if not filter:
                return True
            for key, value in filter.items():
                if document.get(key) != value:
                    return False
            return True

        def _ensure_unique(self, document: Dict[str, Any]) -> None:
            for field in self._unique_fields:
                value = document.get(field)
                if value is None:
                    continue
                for other in self._documents:
                    if other is document:
                        continue
                    if other.get(field) == value:
                        raise DuplicateKeyError(f"Duplicate value for {field}")

        async def insert_one(self, document: Dict[str, Any]) -> InMemoryInsertOneResult:
            doc = document.copy()
            doc.setdefault("_id", ObjectId())
            self._documents.append(doc)
            try:
                self._ensure_unique(doc)
            except DuplicateKeyError:
                self._documents.pop()
                raise
            return InMemoryInsertOneResult(inserted_id=doc["_id"])

        async def find_one(self, filter: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
            for doc in reversed(self._documents):
                if self._matches(doc, filter):
                    return doc.copy()
            return None

        def find(self, filter: Optional[Dict[str, Any]] = None) -> InMemoryCursor:
            matched = [doc for doc in self._documents if self._matches(doc, filter)]
            return InMemoryCursor(matched)

        async def delete_one(self, filter: Dict[str, Any]) -> InMemoryDeleteResult:
            for index, doc in enumerate(self._documents):
                if self._matches(doc, filter):
                    self._documents.pop(index)
                    return InMemoryDeleteResult(deleted_count=1)
            return InMemoryDeleteResult(deleted_count=0)

        def _apply_update(self, document: Dict[str, Any], update: Dict[str, Any]) -> None:
            set_values = update.get("$set", {})
            for key, value in set_values.items():
                document[key] = value

        async def update_one(self, filter: Dict[str, Any], update: Dict[str, Any]) -> InMemoryUpdateResult:
            for doc in self._documents:
                if self._matches(doc, filter):
                    before = doc.copy()
                    self._apply_update(doc, update)
                    try:
                        self._ensure_unique(doc)
                    except DuplicateKeyError:
                        doc.clear()
                        doc.update(before)
                        raise
                    modified = 1 if doc != before else 0
                    return InMemoryUpdateResult(matched_count=1, modified_count=modified)
            return InMemoryUpdateResult(matched_count=0, modified_count=0)

        async def find_one_and_update(
            self, filter: Dict[str, Any], update: Dict[str, Any], return_document: ReturnDocument = ReturnDocument.BEFORE
        ) -> Optional[Dict[str, Any]]:
            for doc in self._documents:
                if self._matches(doc, filter):
                    before = doc.copy()
                    self._apply_update(doc, update)
                    try:
                        self._ensure_unique(doc)
                    except DuplicateKeyError:
                        doc.clear()
                        doc.update(before)
                        raise
                    return doc.copy() if return_document == ReturnDocument.AFTER else before
            return None

    class InMemoryClient:
        def __init__(self):
            self._collections: Dict[str, InMemoryCollection] = {}

        def get_collection(self, name: str) -> InMemoryCollection:
            collection = self._collections.get(name)
            if collection is None:
                collection = InMemoryCollection(name)
                self._collections[name] = collection
            return collection

        def close(self) -> None:
            self._collections.clear()

    client = InMemoryClient()
    users = client.get_collection("users")
    sessions = client.get_collection("sessions")
    simulations = client.get_collection("simulations")

else:
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DATABASE_NAME]
    users = db["users"]
    sessions = db["sessions"]
    simulations = db["simulations"]


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str

    model_config = ConfigDict(populate_by_name=True)


class AuthResponse(BaseModel):
    token: str
    user: UserPublic


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    name: str = Field(min_length=1, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class DevBypassRequest(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)

    model_config = ConfigDict(populate_by_name=True)


class MarketQuote(BaseModel):
    symbol: str
    price: float
    change: float
    change_percent: float = Field(alias="changePercent")
    previous_close: Optional[float] = Field(default=None, alias="previousClose")
    currency: Optional[str] = None
    updated: dt.datetime

    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={dt.datetime: lambda value: value.isoformat()},
    )


class SimulationCreate(BaseModel):
    symbol: str = Field(min_length=1, max_length=6)
    strategy: str = Field(min_length=1, max_length=120)
    starting_capital: float = Field(gt=0, alias="startingCapital")
    notes: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class SimulationUpdate(BaseModel):
    status: Optional[str] = Field(default=None, pattern="^(active|completed|paused)$")
    notes: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class SimulationOut(BaseModel):
    id: str
    symbol: str
    strategy: str
    starting_capital: float = Field(alias="startingCapital")
    status: str
    created_at: dt.datetime = Field(alias="createdAt")
    notes: Optional[str] = None

    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={dt.datetime: lambda value: value.isoformat()},
    )


def serialize_user(doc: Dict[str, Any]) -> UserPublic:
    return UserPublic.model_validate({
        "id": str(doc["_id"]),
        "email": doc["email"],
        "name": doc["name"],
    })


def serialize_simulation(doc: Dict[str, Any]) -> SimulationOut:
    return SimulationOut.model_validate({
        "id": str(doc["_id"]),
        "symbol": doc["symbol"],
        "strategy": doc["strategy"],
        "startingCapital": float(doc["starting_capital"]),
        "status": doc.get("status", "active"),
        "createdAt": doc["created_at"],
        "notes": doc.get("notes"),
    })


async def issue_session(user_id: ObjectId) -> str:
    expires_at = dt.datetime.utcnow() + SESSION_DURATION
    for _ in range(5):
        token = secrets.token_urlsafe(32)
        try:
            await sessions.insert_one(
                {
                    "token": token,
                    "user_id": user_id,
                    "created_at": dt.datetime.utcnow(),
                    "expires_at": expires_at,
                }
            )
            return token
        except DuplicateKeyError:
            continue
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to create session.")


def _parse_authorization(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header.")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization header.")
    return token


async def get_current_user(authorization: Annotated[Optional[str], Header()] = None) -> Dict[str, Any]:
    token = _parse_authorization(authorization)
    session = await sessions.find_one({"token": token})
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or invalid.")

    expires_at = session.get("expires_at")
    if isinstance(expires_at, dt.datetime) and expires_at <= dt.datetime.utcnow():
        await sessions.delete_one({"_id": session["_id"]})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired.")

    user = await users.find_one({"_id": session["user_id"]})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found.")

    return user


def normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper()


async def fetch_quote(symbol: str) -> MarketQuote:
    normalized = normalize_symbol(symbol)

    def _load() -> MarketQuote:
        quote_payload: Dict[str, Any] | None = None
        yahoo_error: Exception | None = None

        try:
            response = requests.get(
                "https://query1.finance.yahoo.com/v7/finance/quote",
                params={"symbols": normalized},
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=8,
            )
            response.raise_for_status()
            payload = response.json()
            results = payload.get("quoteResponse", {}).get("result", [])
            if results:
                quote_payload = results[0]
        except Exception as exc:  # noqa: BLE001
            yahoo_error = exc

        price: Optional[float] = None
        prev_close: Optional[float] = None
        currency = "USD"

        if quote_payload:
            price = quote_payload.get("regularMarketPrice")
            prev_close = quote_payload.get("regularMarketPreviousClose")
            currency = (
                quote_payload.get("currency")
                or quote_payload.get("financialCurrency")
                or currency
            )

        ticker = None
        if price is None or price == 0 or prev_close is None:
            ticker = yf.Ticker(normalized)
            info = getattr(ticker, "fast_info", {}) or {}
            price = info.get("last_price") or price
            prev_close = info.get("previous_close") if prev_close is None else prev_close
            currency = info.get("currency") or currency

        if (price is None or price == 0) and ticker is None:
            ticker = yf.Ticker(normalized)

        if price is None or price == 0:
            history = ticker.history(period="5d", interval="1d", auto_adjust=False)
            if not history.empty:
                price = float(history["Close"].iloc[-1])
                if prev_close is None and len(history) > 1:
                    prev_close = float(history["Close"].iloc[-2])

        if price is None:
            if yahoo_error is not None:
                raise ValueError(f"Yahoo quote API failed: {yahoo_error}") from yahoo_error
            raise ValueError("No price data available")

        if prev_close is None or prev_close == 0:
            change = 0.0
            change_percent = 0.0
            previous_close_value: Optional[float] = None
        else:
            prev_close = float(prev_close)
            change = float(price) - prev_close
            change_percent = (change / prev_close) * 100
            previous_close_value = prev_close

        return MarketQuote.model_validate(
            {
                "symbol": normalized,
                "price": float(price),
                "change": float(change),
                "changePercent": float(change_percent),
                "previousClose": previous_close_value,
                "currency": currency or "USD",
                "updated": dt.datetime.utcnow(),
            }
        )

    try:
        return await asyncio.to_thread(_load)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to load {normalized}: {exc}",
        ) from exc





app = FastAPI(title="Algo Trade Simulator API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event() -> None:
    await users.create_index("email", unique=True)
    await sessions.create_index("token", unique=True)
    await sessions.create_index("expires_at", expireAfterSeconds=0)
    await simulations.create_index([("user_id", 1), ("created_at", -1)])


@app.on_event("shutdown")
async def shutdown_event() -> None:
    client.close()


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/auth/signup", response_model=AuthResponse)
async def signup_endpoint(payload: Annotated[SignupRequest, Body(...)]) -> AuthResponse:
    normalized_email = payload.email.lower()
    user_doc = {
        "email": normalized_email,
        "password_hash": pwd_context.hash(payload.password),
        "name": payload.name.strip(),
        "created_at": dt.datetime.utcnow(),
        "updated_at": dt.datetime.utcnow(),
    }

    try:
        result = await users.insert_one(user_doc)
    except DuplicateKeyError as exc:  # pragma: no cover - deterministic from database
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered.") from exc

    token = await issue_session(result.inserted_id)
    user_public = serialize_user({"_id": result.inserted_id, **user_doc})
    return AuthResponse(token=token, user=user_public)


@app.post("/auth/login", response_model=AuthResponse)
async def login_endpoint(payload: Annotated[LoginRequest, Body(...)]) -> AuthResponse:
    normalized_email = payload.email.lower()
    user = await users.find_one({"email": normalized_email})
    if not user or not pwd_context.verify(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    token = await issue_session(user["_id"])
    return AuthResponse(token=token, user=serialize_user(user))

if ENABLE_DEV_ENDPOINTS:

    @app.post("/dev/auth/bypass", response_model=AuthResponse)
    async def dev_auth_bypass(
        payload: Annotated[Optional[DevBypassRequest], Body(default=None)] = None,
    ) -> AuthResponse:
        request_data = payload or DevBypassRequest()
        normalized_email = (request_data.email or "dev@example.com").lower()
        preferred_name = request_data.name.strip() if request_data.name else "Developer"

        user = await users.find_one({"email": normalized_email})
        now = dt.datetime.utcnow()

        if not user:
            password_hash = pwd_context.hash(secrets.token_urlsafe(16))
            user_doc = {
                "email": normalized_email,
                "password_hash": password_hash,
                "name": preferred_name,
                "created_at": now,
                "updated_at": now,
            }
            try:
                result = await users.insert_one(user_doc)
            except DuplicateKeyError:
                user = await users.find_one({"email": normalized_email})
            else:
                user = {"_id": result.inserted_id, **user_doc}

        if not user:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to create development account.",
            )

        if preferred_name and preferred_name != user.get("name"):
            await users.update_one(
                {"_id": user["_id"]},
                {"$set": {"name": preferred_name, "updated_at": now}},
            )
            user = {**user, "name": preferred_name, "updated_at": now}

        token = await issue_session(user["_id"])
        return AuthResponse(token=token, user=serialize_user(user))



@app.get("/market/watchlist", response_model=List[MarketQuote])
async def watchlist_endpoint(
    symbols: Annotated[Optional[str], Query(description="Comma separated ticker symbols.")] = None,
) -> List[MarketQuote]:
    symbol_list = [normalize_symbol(item) for item in symbols.split(",")] if symbols else DEFAULT_WATCHLIST
    unique_symbols = [symbol for i, symbol in enumerate(symbol_list) if symbol and symbol not in symbol_list[:i]]
    if not unique_symbols:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid symbols provided.")

    quotes = await asyncio.gather(*[fetch_quote(symbol) for symbol in unique_symbols], return_exceptions=True)
    results: List[MarketQuote] = []
    errors: List[str] = []
    for symbol, quote in zip(unique_symbols, quotes):
        if isinstance(quote, MarketQuote):
            results.append(quote)
        else:
            errors.append(f"{symbol}: {quote}")

    if not results:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="; ".join(errors))

    return results


@app.get("/market/quote/{symbol}", response_model=MarketQuote)
async def quote_endpoint(symbol: str) -> MarketQuote:
    return await fetch_quote(symbol)


@app.get("/simulations", response_model=List[SimulationOut])
async def list_simulations(current_user: Dict[str, Any] = Depends(get_current_user)) -> List[SimulationOut]:
    cursor = simulations.find({"user_id": current_user["_id"]}).sort("created_at", -1)
    documents = await cursor.to_list(length=100)
    return [serialize_simulation(doc) for doc in documents]


@app.post("/simulations", response_model=SimulationOut, status_code=status.HTTP_201_CREATED)
async def create_simulation_endpoint(
    payload: Annotated[SimulationCreate, Body(...)],
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> SimulationOut:
    document = {
        "user_id": current_user["_id"],
        "symbol": normalize_symbol(payload.symbol),
        "strategy": payload.strategy.strip(),
        "starting_capital": float(payload.starting_capital),
        "status": "active",
        "notes": payload.notes.strip() if payload.notes else None,
        "created_at": dt.datetime.utcnow(),
        "updated_at": dt.datetime.utcnow(),
    }

    result = await simulations.insert_one(document)
    return serialize_simulation({"_id": result.inserted_id, **document})


@app.patch("/simulations/{simulation_id}", response_model=SimulationOut)
async def update_simulation_endpoint(
    simulation_id: str,
    payload: Annotated[SimulationUpdate, Body(...)],
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> SimulationOut:
    try:
        obj_id = ObjectId(simulation_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid simulation id.") from exc

    update_fields: Dict[str, Any] = {}
    if payload.status:
        update_fields["status"] = payload.status
    if payload.notes is not None:
        update_fields["notes"] = payload.notes.strip() or None

    if not update_fields:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid fields provided.")

    update_fields["updated_at"] = dt.datetime.utcnow()

    result = await simulations.find_one_and_update(
        {"_id": obj_id, "user_id": current_user["_id"]},
        {"$set": update_fields},
        return_document=ReturnDocument.AFTER,
    )

    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Simulation not found.")

    return serialize_simulation(result)


from fastapi import Response

@app.delete("/simulations/{simulation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_simulation_endpoint(
    simulation_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Response:
    try:
        obj_id = ObjectId(simulation_id)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid simulation id.") from exc

    deletion = await simulations.delete_one({"_id": obj_id, "user_id": current_user["_id"]})
    if deletion.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Simulation not found.")

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/auth/session", response_model=AuthResponse)
async def session_endpoint(
    current_user: Dict[str, Any] = Depends(get_current_user),
    authorization: Annotated[Optional[str], Header()] = None,
) -> AuthResponse:
    token = _parse_authorization(authorization)
    return AuthResponse(token=token, user=serialize_user(current_user))
