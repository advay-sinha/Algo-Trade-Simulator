"""NLP inference behind one interface: hosted Hugging Face Inference (default) or local transformers.

hf-api: plain REST calls to the Hugging Face inference router (no huggingface_hub package, so the
deployed bundle stays small). Needs HF_TOKEN. Hosted models can cold-start: a 503 "loading"
response is retried with backoff inside a fixed budget, then reported as "warming up".
local:  in-process transformers / sentence-transformers (requirements-local-ml.txt), loaded once
per process. For offline development only — never deployed.

All functions here are blocking; call them via asyncio.to_thread from async code.
"""

from __future__ import annotations

import importlib.util
import logging
import math
import threading
import time
from typing import Any, Dict, List, Optional, Sequence

import requests

from backend.config import settings

logger = logging.getLogger("algo_trade_backend.nlp")

REQUEST_TIMEOUT_SECONDS = 15
WARMUP_BUDGET_SECONDS = 10.0
MAX_INPUT_CHARS = 2000


class NlpError(Exception):
    """Base error; `message` is safe to show to users (never provider response text)."""

    status_code = 502
    message = "The language-analysis service couldn't handle that request. Try again shortly."

    def __init__(self, message: Optional[str] = None, retry_after: Optional[int] = None) -> None:
        super().__init__(message or self.message)
        if message:
            self.message = message
        self.retry_after = retry_after


class NlpNotConfigured(NlpError):
    status_code = 503
    message = "Research NLP isn't configured on this server. An administrator needs to set HF_TOKEN (a free Hugging Face read token)."


class NlpWarmingUp(NlpError):
    status_code = 503
    message = "The language model is warming up. Retry in a few seconds."


class NlpUnavailable(NlpError):
    status_code = 502


def provider() -> str:
    return "local" if settings.nlp_provider == "local" else "hf-api"


def configured() -> bool:
    if provider() == "local":
        return importlib.util.find_spec("transformers") is not None and importlib.util.find_spec("sentence_transformers") is not None
    return bool(settings.hf_token)


def info() -> Dict[str, Any]:
    return {
        "configured": configured(),
        "provider": provider(),
        "sentimentModel": settings.sentiment_model,
        "embeddingModel": settings.embedding_model,
    }


def _clip(texts: Sequence[str]) -> List[str]:
    return [text[:MAX_INPUT_CHARS] for text in texts]


# --- hosted ---------------------------------------------------------------------------------

def _post(model: str, payload: Dict[str, Any], pipeline: Optional[str] = None) -> Any:
    if not settings.hf_token:
        raise NlpNotConfigured()
    url = f"{settings.hf_inference_url.rstrip('/')}/{model}"
    if pipeline:
        url += f"/pipeline/{pipeline}"
    headers = {"Authorization": f"Bearer {settings.hf_token}"}
    deadline = time.monotonic() + WARMUP_BUDGET_SECONDS
    while True:
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=REQUEST_TIMEOUT_SECONDS)
        except requests.RequestException as exc:
            logger.warning("HF inference request failed: %s", type(exc).__name__)
            raise NlpUnavailable() from exc
        if response.status_code == 200:
            return response.json()
        if response.status_code == 503:
            try:
                estimated = float(response.json().get("estimated_time") or 5)
            except Exception:  # noqa: BLE001 - body may not be JSON
                estimated = 5.0
            wait = min(max(estimated, 1.0), 4.0)
            if time.monotonic() + wait > deadline:
                raise NlpWarmingUp(retry_after=max(5, int(math.ceil(estimated))))
            time.sleep(wait)
            continue
        if response.status_code == 429:
            retry = response.headers.get("Retry-After")
            raise NlpUnavailable("The language-analysis service is rate limiting requests. Try again shortly.", retry_after=int(retry) if retry and retry.isdigit() else 30)
        if response.status_code in (401, 403):
            logger.warning("HF inference rejected the token (status %s)", response.status_code)
            raise NlpUnavailable("The language-analysis service rejected this server's credentials. An administrator needs to check HF_TOKEN.")
        if response.status_code == 404:
            logger.warning("HF inference model not available: %s", model)
            raise NlpUnavailable("The configured language model isn't available from the inference service.")
        logger.warning("HF inference error status %s for %s", response.status_code, model)
        raise NlpUnavailable()


def _normalize_classification(raw: Any, count: int) -> List[List[Dict[str, Any]]]:
    """Accepts [{..}], [[{..}]], or {"label","score"} shapes; returns one label list per input."""
    if isinstance(raw, dict):
        raw = [[raw]]
    if not isinstance(raw, list):
        raise NlpUnavailable()
    if raw and isinstance(raw[0], dict):
        raw = [raw] if count == 1 else [[item] for item in raw]
    rows = []
    for row in raw:
        if isinstance(row, dict):
            row = [row]
        rows.append([{"label": str(item["label"]), "score": float(item["score"])} for item in row])
    if len(rows) != count:
        raise NlpUnavailable()
    return rows


def _unit(vector: Sequence[float]) -> List[float]:
    norm = math.sqrt(sum(v * v for v in vector)) or 1.0
    return [float(v) / norm for v in vector]


def _pool(item: Any) -> List[float]:
    """Sentence vector from a feature-extraction result (already pooled, or token vectors to mean)."""
    if item and isinstance(item[0], list):
        if item[0] and isinstance(item[0][0], list):  # [1, tokens, dim]
            item = item[0]
        dims = len(item[0])
        return [sum(token[d] for token in item) / len(item) for d in range(dims)]
    return [float(v) for v in item]


# --- local (optional, never deployed) -------------------------------------------------------

_local_lock = threading.Lock()
_local: Dict[str, Any] = {}


def _local_models() -> Dict[str, Any]:
    with _local_lock:
        if not _local:
            if not configured():
                raise NlpNotConfigured("Local NLP needs transformers and sentence-transformers (requirements-local-ml.txt).")
            from sentence_transformers import SentenceTransformer  # type: ignore[import-not-found]
            from transformers import pipeline  # type: ignore[import-not-found]

            _local["classifier"] = pipeline("text-classification", model=settings.sentiment_model, top_k=None, device=-1)
            _local["embedder"] = SentenceTransformer(settings.embedding_model, device="cpu")
        return _local


# --- public API -----------------------------------------------------------------------------

def classify(texts: Sequence[str]) -> List[List[Dict[str, Any]]]:
    """Label scores for each text from the sentiment model."""
    clipped = _clip(texts)
    if provider() == "local":
        output = _local_models()["classifier"](clipped, truncation=True)
        return _normalize_classification(output, len(clipped))
    raw = _post(settings.sentiment_model, {"inputs": clipped, "parameters": {"top_k": 5}})
    return _normalize_classification(raw, len(clipped))


def embed(texts: Sequence[str]) -> List[List[float]]:
    """Unit-length sentence embeddings, one per text."""
    clipped = _clip(texts)
    if provider() == "local":
        vectors = _local_models()["embedder"].encode(clipped, normalize_embeddings=True)
        return [[float(v) for v in row] for row in vectors]
    raw = _post(settings.embedding_model, {"inputs": clipped}, pipeline="feature-extraction")
    if not isinstance(raw, list) or len(raw) != len(clipped):
        raise NlpUnavailable()
    return [_unit(_pool(item)) for item in raw]
