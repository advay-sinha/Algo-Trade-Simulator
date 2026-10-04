"""FastAPI dependencies: the lazily created store and the authenticated user."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional

from fastapi import Depends, Header, HTTPException, status

from backend.config import HOSTED, IS_PRODUCTION, mask_mongo_dsn, resolve_mongo_dsn, settings
from backend.stores import (
    ASCENDING,
    AsyncIOMotorClient,
    DuplicateKeyError,
    InMemoryStore,
    MongoStore,
    ReturnDocument,
    Store,
)

logger = logging.getLogger("algo_trade_backend")


def dev_endpoints_enabled() -> bool:
    return settings.enable_dev_endpoints and not IS_PRODUCTION


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
        if HOSTED:
            logger.warning("USE_IN_MEMORY_DB is set on hosted infrastructure; data is lost on every restart or scale event")
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
    if isinstance(_store, InMemoryStore):
        # In-memory data isn't tied to an event loop — keep it, just give it a lock for this loop.
        _store.lock = asyncio.Lock()
        _store_loop = loop
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
