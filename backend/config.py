"""Application settings, environment loading, and platform detection."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel, Field

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:  # pragma: no cover - optional dependency
    load_dotenv = None

# Local development reads backend/.env; hosted deployments provide real environment
# variables instead, and those always win (override=False).
if load_dotenv is not None:
    load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

TRUTHY_ENV_VALUES = {"1", "true", "yes", "on"}
LOCAL_DEV_ORIGIN = "http://localhost:5173"

# Vercel sets VERCEL=1 for builds and functions; VERCEL_ENV is production / preview / development.
ON_VERCEL = bool(os.getenv("VERCEL"))
VERCEL_ENV = os.getenv("VERCEL_ENV", "")
IS_PRODUCTION = VERCEL_ENV == "production"


def env_flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in TRUTHY_ENV_VALUES


def env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def env_list(name: str) -> List[str]:
    return [item.strip() for item in os.getenv(name, "").split(",") if item.strip()]


class Settings(BaseModel):
    frontend_origin: str = Field(default_factory=lambda: os.getenv("FRONTEND_ORIGIN", LOCAL_DEV_ORIGIN))
    cors_origins: List[str] = Field(default_factory=lambda: env_list("CORS_ORIGINS"))
    session_duration_days: int = Field(default_factory=lambda: env_int("SESSION_DURATION_DAYS", 7))
    enable_dev_endpoints: bool = Field(default_factory=lambda: env_flag("ENABLE_DEV_ENDPOINTS"))
    use_in_memory_db: bool = Field(default_factory=lambda: env_flag("USE_IN_MEMORY_DB", "false"))
    # Serverless instances don't share memory, so a silent in-memory fallback would lose data;
    # strict mode is therefore the default whenever the app runs on Vercel.
    strict_db: bool = Field(default_factory=lambda: env_flag("STRICT_DB", "true" if ON_VERCEL else "false"))
    mongo_url: Optional[str] = Field(default_factory=lambda: os.getenv("MONGO_URL"))
    mongodb_uri: Optional[str] = Field(default_factory=lambda: os.getenv("MONGODB_URI"))
    mongo_uri: Optional[str] = Field(default_factory=lambda: os.getenv("MONGO_URI"))
    mongodb_db: str = Field(default_factory=lambda: os.getenv("MONGODB_DB", "algo-trade-simulator"))
    mongo_max_pool_size: int = Field(default_factory=lambda: env_int("MONGO_MAX_POOL_SIZE", 5))
    rate_limit_storage_uri: str = Field(default_factory=lambda: os.getenv("RATE_LIMIT_STORAGE_URI", "memory://"))
    auth_rate_limit_per_minute: int = Field(default_factory=lambda: env_int("AUTH_RATE_LIMIT_PER_MINUTE", 5))
    market_rate_limit_per_minute: int = Field(default_factory=lambda: env_int("MARKET_RATE_LIMIT_PER_MINUTE", 60))
    # Fallback quotes/charts are always flagged with source="offline"/"synthetic"; this switch
    # turns fabrication off entirely (errors instead) for deployments that prefer that.
    allow_offline_market_data: bool = Field(default_factory=lambda: env_flag("ALLOW_OFFLINE_MARKET_DATA", "true"))
    # Optional MLflow tracking server (e.g. a free DagsHub repository). Unset = tracking off.
    mlflow_tracking_uri: Optional[str] = Field(default_factory=lambda: os.getenv("MLFLOW_TRACKING_URI"))
    mlflow_tracking_username: Optional[str] = Field(default_factory=lambda: os.getenv("MLFLOW_TRACKING_USERNAME"))
    mlflow_tracking_password: Optional[str] = Field(default_factory=lambda: os.getenv("MLFLOW_TRACKING_PASSWORD"))
    mlflow_experiment_name: str = Field(default_factory=lambda: os.getenv("MLFLOW_EXPERIMENT_NAME", "algo-trade-lab"))
    yahoo_user_agent: str = Field(
        default_factory=lambda: os.getenv(
            "YAHOO_USER_AGENT",
            "Mozilla/5.0 (compatible; AlgoTradeSimulator/1.0; +https://example.com)",
        ),
    )
    openai_api_key: Optional[str] = Field(default_factory=lambda: os.getenv("OPENAI_API_KEY"))
    openai_model: str = Field(default_factory=lambda: os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
    openai_base_url: Optional[str] = Field(default_factory=lambda: os.getenv("OPENAI_BASE_URL"))
    openai_organization: Optional[str] = Field(
        default_factory=lambda: os.getenv("OPENAI_ORG") or os.getenv("OPENAI_ORGANIZATION")
    )
    openai_temperature: float = Field(default_factory=lambda: float(os.getenv("OPENAI_TEMPERATURE", "0.3")))
    openai_model_fallbacks: List[str] = Field(default_factory=lambda: env_list("OPENAI_MODEL_FALLBACKS"))


def resolve_mongo_dsn(config: Settings) -> Optional[str]:
    if config.mongo_url:
        return config.mongo_url
    if config.mongodb_uri:
        return config.mongodb_uri
    if config.mongo_uri:
        return config.mongo_uri
    if not config.use_in_memory_db:
        return "mongodb://localhost:27017"
    return None


def mask_mongo_dsn(dsn: str) -> str:
    return re.sub(r"//([^:@]+):([^@]+)@", "//***:***@", dsn)


def allowed_cors_origins(config: Settings) -> List[str]:
    origins = list(config.cors_origins) or [config.frontend_origin]
    if not ON_VERCEL and LOCAL_DEV_ORIGIN not in origins:
        origins.append(LOCAL_DEV_ORIGIN)
    # Credentials are allowed, so a wildcard origin is never acceptable.
    return [origin for origin in origins if origin and origin != "*"]


settings = Settings()
