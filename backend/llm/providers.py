"""LLM provider presets. Every provider here speaks the OpenAI-compatible chat API with tool
calling, so one client (langchain-openai's ChatOpenAI with a base_url) covers them all.

Free options:
- groq        — hosted open-weight models (gpt-oss, Qwen), free tier, no card. Works in deployment.
- ollama      — fully open source, runs locally (`ollama serve`). No key. Local only.
- openrouter  — hosted, ":free" model variants. Free account key.
- huggingface — Hugging Face router; reuses HF_TOKEN (small free monthly credits).
Paid: openai.

Selection: LLM_PROVIDER if set; otherwise the first provider whose key is present
(GROQ_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY). LLM_MODEL / LLM_BASE_URL / LLM_API_KEY
override any preset.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict, Optional

PRESETS: Dict[str, Dict[str, Optional[str]]] = {
    # "fallbacks": comma-separated models tried on rate limits unless LLM_MODEL_FALLBACKS is set.
    # Groq retires models often; check GET /openai/v1/models when a preset 404s (model_not_found).
    "groq": {"base_url": "https://api.groq.com/openai/v1", "model": "openai/gpt-oss-120b", "key_env": "GROQ_API_KEY", "fallbacks": "openai/gpt-oss-20b"},
    "ollama": {"base_url": "http://localhost:11434/v1", "model": "qwen2.5:7b", "key_env": None},
    "openrouter": {"base_url": "https://openrouter.ai/api/v1", "model": "meta-llama/llama-3.3-70b-instruct:free", "key_env": "OPENROUTER_API_KEY"},
    "huggingface": {"base_url": "https://router.huggingface.co/v1", "model": "Qwen/Qwen2.5-72B-Instruct", "key_env": "HF_TOKEN"},
    "openai": {"base_url": None, "model": "gpt-4o-mini", "key_env": "OPENAI_API_KEY"},
}
AUTO_ORDER = ("groq", "openrouter", "openai")


@dataclass(frozen=True)
class LlmConfig:
    provider: str
    model: str
    base_url: Optional[str]
    api_key: str
    fallbacks: tuple

    def public(self) -> Dict[str, str]:
        return {"provider": self.provider, "model": self.model}


def _env(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    value = os.getenv(name, "").strip()
    return value or None


def resolve() -> Optional[LlmConfig]:
    """Current provider config from the environment, or None when nothing usable is configured."""
    provider = (_env("LLM_PROVIDER") or "").lower() or None
    if provider is None:
        provider = next((name for name in AUTO_ORDER if _env(PRESETS[name]["key_env"])), None)
    if provider is None or provider not in PRESETS:
        return None
    preset = PRESETS[provider]
    api_key = _env("LLM_API_KEY") or _env(preset["key_env"])
    if provider == "ollama":
        api_key = api_key or "ollama"  # the OpenAI client requires a value; Ollama ignores it
    if not api_key:
        return None
    base_url = _env("LLM_BASE_URL") or (_env("OLLAMA_BASE_URL") if provider == "ollama" else None) or preset["base_url"]
    legacy_model = _env("OPENAI_MODEL") if provider == "openai" else None
    model = _env("LLM_MODEL") or legacy_model or str(preset["model"])
    # The legacy OPENAI_* names hold OpenAI model ids, so they only apply to the openai provider.
    legacy_fallbacks = os.getenv("OPENAI_MODEL_FALLBACKS") if provider == "openai" else None
    raw_fallbacks = os.getenv("LLM_MODEL_FALLBACKS") or legacy_fallbacks
    if raw_fallbacks is None and not _env("LLM_MODEL"):
        raw_fallbacks = preset.get("fallbacks") or ""
    fallbacks = tuple(item.strip() for item in (raw_fallbacks or "").split(",") if item.strip() and item.strip() != model)
    return LlmConfig(provider=provider, model=model, base_url=base_url, api_key=api_key, fallbacks=fallbacks)
