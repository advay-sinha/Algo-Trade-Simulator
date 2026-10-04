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

APP_VERSION = "0.4.0"
TRUTHY_ENV_VALUES = {"1", "true", "yes", "on"}
LOCAL_DEV_ORIGIN = "http://localhost:5173"

# Hosting detection. Vercel sets VERCEL=1 and VERCEL_ENV (production / preview / development);
# container hosts (Koyeb, Render, Docker) get APP_ENV=production from the Dockerfile.
ON_VERCEL = bool(os.getenv("VERCEL"))
VERCEL_ENV = os.getenv("VERCEL_ENV", "")
APP_ENV = os.getenv("APP_ENV", "").strip().lower()
IS_PRODUCTION = VERCEL_ENV == "production" or APP_ENV == "production"
# Managed hosting: behind a proxy, logs collected from stdout, no local-development conveniences.
HOSTED = ON_VERCEL or IS_PRODUCTION


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
    # Hosted instances restart and scale independently, so a silent in-memory fallback would lose
    # data; strict mode is therefore the default whenever the app is hosted.
    strict_db: bool = Field(default_factory=lambda: env_flag("STRICT_DB", "true" if HOSTED else "false"))
    # Behind a proxy the socket peer is the proxy; trust X-Forwarded-For's first hop for client IPs.
    trust_proxy_headers: bool = Field(default_factory=lambda: env_flag("TRUST_PROXY_HEADERS", "true" if HOSTED else "false"))
    mongo_url: Optional[str] = Field(default_factory=lambda: os.getenv("MONGO_URL"))
    mongodb_uri: Optional[str] = Field(default_factory=lambda: os.getenv("MONGODB_URI"))
    mongo_uri: Optional[str] = Field(default_factory=lambda: os.getenv("MONGO_URI"))
    mongodb_db: str = Field(default_factory=lambda: os.getenv("MONGODB_DB", "algo-trade-simulator"))
    mongo_max_pool_size: int = Field(default_factory=lambda: env_int("MONGO_MAX_POOL_SIZE", 5))
    rate_limit_storage_uri: str = Field(default_factory=lambda: os.getenv("RATE_LIMIT_STORAGE_URI", ""))
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
    # Research NLP (Phase 7): hosted Hugging Face inference by default; "local" uses transformers.
    hf_token: Optional[str] = Field(default_factory=lambda: (os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACEHUB_API_TOKEN") or "").strip() or None)
    nlp_provider: str = Field(default_factory=lambda: os.getenv("NLP_PROVIDER", "hf-api").strip().lower() or "hf-api")
    sentiment_model: str = Field(default_factory=lambda: os.getenv("SENTIMENT_MODEL", "ProsusAI/finbert"))
    embedding_model: str = Field(default_factory=lambda: os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"))
    hf_inference_url: str = Field(default_factory=lambda: os.getenv("HF_INFERENCE_URL", "https://router.huggingface.co/hf-inference/models"))
    # Name of an Atlas Vector Search index on research_notes.embedding; unset = exact NumPy scan.
    atlas_vector_index: Optional[str] = Field(default_factory=lambda: os.getenv("ATLAS_VECTOR_INDEX") or None)
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
    if not HOSTED and LOCAL_DEV_ORIGIN not in origins:
        origins.append(LOCAL_DEV_ORIGIN)
    # Credentials are allowed, so a wildcard origin is never acceptable.
    return [origin for origin in origins if origin and origin != "*"]


settings = Settings()
