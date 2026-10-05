"""Application assembly: middleware, logging, and routers. Feature code lives in the
api/, services/, strategies/, analytics/, ml/, and llm/ packages."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from backend.api import analytics, auth, backtests, copilot, flows, market, ml, portfolio, research, simulations, system
from backend.api.errors import validation_error_handler
from backend.logging_config import RequestContextMiddleware, configure_logging
from backend.config import APP_VERSION, IS_PRODUCTION, allowed_cors_origins, settings
from backend.deps import get_current_user, get_store  # re-exported for tests and tooling
from backend.models.simulation import SimulationInput  # re-exported for backwards compatibility
from backend.stores import InMemoryStore, MongoStore  # re-exported for tests and tooling

configure_logging()
logger = logging.getLogger("algo_trade_backend")

app = FastAPI(
    title="Algo Trade Lab API",
    version=APP_VERSION,
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
    expose_headers=["X-Request-ID"],
)
app.add_middleware(RequestContextMiddleware)
# 422 bodies never echo submitted values (passwords, IDs typed into the wrong field).
app.add_exception_handler(RequestValidationError, validation_error_handler)

if settings.enable_dev_endpoints:
    if IS_PRODUCTION:
        logger.error("ENABLE_DEV_ENDPOINTS is set in production; dev endpoints stay disabled")
    else:
        logger.warning("DEV ENDPOINTS ENABLED: /api/dev/auth/bypass issues sessions without a password. Local development only.")

# Every route lives under /api so the SPA and the API can share one origin.
for module in (auth, market, flows, analytics, simulations, backtests, ml, research, copilot, portfolio, system):
    app.include_router(module.router)

__all__ = ["app", "get_current_user", "get_store", "InMemoryStore", "MongoStore", "SimulationInput"]
