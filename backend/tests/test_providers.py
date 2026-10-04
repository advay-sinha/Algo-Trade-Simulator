"""LLM provider resolution (free providers first, explicit choice wins, no-key Ollama)."""

import os

from backend.llm.providers import resolve

KEYS = ("LLM_PROVIDER", "LLM_API_KEY", "LLM_MODEL", "LLM_BASE_URL", "LLM_MODEL_FALLBACKS", "GROQ_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_MODEL_FALLBACKS", "HF_TOKEN", "OLLAMA_BASE_URL")


def with_env(values, fn):
    saved = {key: os.environ.get(key) for key in KEYS}
    try:
        for key in KEYS:
            os.environ.pop(key, None)
        os.environ.update(values)
        return fn()
    finally:
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def test_nothing_configured_returns_none():
    assert with_env({}, resolve) is None


def test_free_groq_preferred_over_openai_when_both_present():
    config = with_env({"GROQ_API_KEY": "g", "OPENAI_API_KEY": "o"}, resolve)
    assert config.provider == "groq" and config.base_url.startswith("https://api.groq.com") and config.api_key == "g"


def test_explicit_provider_wins_and_overrides_apply():
    config = with_env({"LLM_PROVIDER": "openrouter", "OPENROUTER_API_KEY": "r", "GROQ_API_KEY": "g", "LLM_MODEL": "custom/model"}, resolve)
    assert config.provider == "openrouter" and config.model == "custom/model" and config.api_key == "r"


def test_ollama_needs_no_key_and_respects_base_url():
    config = with_env({"LLM_PROVIDER": "ollama", "OLLAMA_BASE_URL": "http://gpu-box:11434/v1"}, resolve)
    assert config.provider == "ollama" and config.api_key == "ollama" and config.base_url == "http://gpu-box:11434/v1"


def test_huggingface_reuses_hf_token():
    config = with_env({"LLM_PROVIDER": "huggingface", "HF_TOKEN": "h"}, resolve)
    assert config.provider == "huggingface" and config.api_key == "h"


def test_selected_provider_without_key_is_unconfigured():
    assert with_env({"LLM_PROVIDER": "groq"}, resolve) is None


def test_public_info_never_contains_the_key():
    config = with_env({"GROQ_API_KEY": "secret-key"}, resolve)
    assert "secret-key" not in str(config.public())


def test_groq_preset_fallbacks_apply_unless_overridden():
    preset = with_env({"GROQ_API_KEY": "g"}, resolve)
    assert preset.model == "openai/gpt-oss-120b" and preset.fallbacks == ("openai/gpt-oss-20b",)
    explicit = with_env({"GROQ_API_KEY": "g", "LLM_MODEL_FALLBACKS": "a,b"}, resolve)
    assert explicit.fallbacks == ("a", "b")
    custom_model = with_env({"GROQ_API_KEY": "g", "LLM_MODEL": "qwen/qwen3.8-27b"}, resolve)
    assert custom_model.fallbacks == ()


def test_legacy_openai_fallbacks_only_apply_to_openai():
    groq = with_env({"GROQ_API_KEY": "g", "OPENAI_MODEL_FALLBACKS": "gpt-4o,gpt-3.5-turbo"}, resolve)
    assert groq.provider == "groq" and groq.fallbacks == ("openai/gpt-oss-20b",)
    openai = with_env({"OPENAI_API_KEY": "o", "OPENAI_MODEL_FALLBACKS": "gpt-4o,gpt-3.5-turbo"}, resolve)
    assert openai.provider == "openai" and openai.fallbacks == ("gpt-4o", "gpt-3.5-turbo")
