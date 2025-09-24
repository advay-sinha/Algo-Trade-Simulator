from __future__ import annotations

import asyncio
import datetime as dt
import os
import secrets
from typing import Annotated, Any, Dict, List, Optional

import yfinance as yf
from bson import ObjectId
from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection
from passlib.context import CryptContext
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

DATABASE_NAME = os.getenv("MONGODB_DB", "algo-trade-simulator")
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
try:
    session_days = float(os.getenv("SESSION_DURATION_DAYS", "7"))
except ValueError:
    session_days = 7.0

SESSION_DURATION = dt.timedelta(days=session_days)
DEFAULT_WATCHLIST = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA"]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
client = AsyncIOMotorClient(MONGODB_URI)
db = client[DATABASE_NAME]
users: AsyncIOMotorCollection = db["users"]
sessions: AsyncIOMotorCollection = db["sessions"]
simulations: AsyncIOMotorCollection = db["simulations"]


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
    password: str = Field(min_length=8)
    name: str = Field(min_length=1, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


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
        ticker = yf.Ticker(normalized)
        info = getattr(ticker, "fast_info", {}) or {}
        price = info.get("last_price")
        prev_close = info.get("previous_close")
        currency = info.get("currency") or "USD"

        if price is None or price == 0:
            history = ticker.history(period="5d", interval="1d")
            if not history.empty:
                price = float(history["Close"].iloc[-1])
                if prev_close is None and len(history) > 1:
                    prev_close = float(history["Close"].iloc[-2])

        if price is None:
            raise ValueError("No price data available")

        if prev_close is None or prev_close == 0:
            change = 0.0
            change_percent = 0.0
        else:
            prev_close = float(prev_close)
            change = float(price) - prev_close
            change_percent = (change / prev_close) * 100

        return MarketQuote.model_validate(
            {
                "symbol": normalized,
                "price": float(price),
                "change": float(change),
                "changePercent": float(change_percent),
                "previousClose": float(prev_close) if prev_close else None,
                "currency": currency,
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


@app.delete("/simulations/{simulation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_simulation_endpoint(
    simulation_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> None:
    try:
        obj_id = ObjectId(simulation_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid simulation id.") from exc

    deletion = await simulations.delete_one({"_id": obj_id, "user_id": current_user["_id"]})
    if deletion.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Simulation not found.")


@app.get("/auth/session", response_model=AuthResponse)
async def session_endpoint(
    current_user: Dict[str, Any] = Depends(get_current_user),
    authorization: Annotated[Optional[str], Header()] = None,
) -> AuthResponse:
    token = _parse_authorization(authorization)
    return AuthResponse(token=token, user=serialize_user(current_user))
