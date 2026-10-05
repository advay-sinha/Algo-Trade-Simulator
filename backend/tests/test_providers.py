"""LLM provider resolution (free providers first, explicit choice wins, no-key Ollama)."""

import os

from backend.llm.providers import resolve, resolve_chain

KEYS = ("LLM_PROVIDER", "LLM_API_KEY", "LLM_MODEL", "LLM_BASE_URL", "LLM_MODEL_FALLBACKS", "GROQ_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_MODEL_FALLBACKS", "HF_TOKEN", "OLLAMA_BASE_URL", "CEREBRAS_API_KEY", "LLM_PROVIDER_FALLBACKS", "GROQ_MODEL", "CEREBRAS_MODEL")


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
    assert preset.model == "openai/gpt-oss-120b" and preset.fallbacks == ("openai/gpt-oss-20b", "qwen/qwen3.8-27b")
    explicit = with_env({"GROQ_API_KEY": "g", "LLM_MODEL_FALLBACKS": "a,b"}, resolve)
    assert explicit.fallbacks == ("a", "b")
    custom_model = with_env({"GROQ_API_KEY": "g", "LLM_MODEL": "qwen/qwen3.8-27b"}, resolve)
    assert custom_model.fallbacks == ()


def test_legacy_openai_fallbacks_only_apply_to_openai():
    groq = with_env({"GROQ_API_KEY": "g", "OPENAI_MODEL_FALLBACKS": "gpt-4o,gpt-3.5-turbo"}, resolve)
    assert groq.provider == "groq" and groq.fallbacks == ("openai/gpt-oss-20b", "qwen/qwen3.8-27b")
    openai = with_env({"OPENAI_API_KEY": "o", "OPENAI_MODEL_FALLBACKS": "gpt-4o,gpt-3.5-turbo"}, resolve)
    assert openai.provider == "openai" and openai.fallbacks == ("gpt-4o", "gpt-3.5-turbo")


def test_chain_adds_every_keyed_provider_after_the_primary():
    chain = with_env({"GROQ_API_KEY": "g", "CEREBRAS_API_KEY": "c", "OPENROUTER_API_KEY": "r", "OPENAI_API_KEY": "o", "HF_TOKEN": "h"}, resolve_chain)
    # Paid OpenAI and Hugging Face credits are never spent unless listed in LLM_PROVIDER_FALLBACKS.
    assert [config.provider for config in chain] == ["groq", "cerebras", "openrouter"]
    assert chain[1].api_key == "c" and chain[1].base_url == "https://api.cerebras.ai/v1"


def test_primary_overrides_do_not_leak_into_fallback_providers():
    env = {"GROQ_API_KEY": "g", "CEREBRAS_API_KEY": "c", "LLM_MODEL": "custom", "LLM_API_KEY": "override", "LLM_BASE_URL": "http://custom/v1"}
    primary, fallback = with_env(env, resolve_chain)
    assert (primary.model, primary.api_key, primary.base_url) == ("custom", "override", "http://custom/v1")
    assert (fallback.model, fallback.api_key, fallback.base_url) == ("gpt-oss-120b", "c", "https://api.cerebras.ai/v1")


def test_per_provider_model_override_drops_preset_fallbacks():
    chain = with_env({"GROQ_API_KEY": "g", "CEREBRAS_API_KEY": "c", "CEREBRAS_MODEL": "new-model"}, resolve_chain)
    assert chain[1].model == "new-model" and chain[1].fallbacks == ()


def test_explicit_provider_fallbacks_replace_the_default_chain():
    explicit = with_env({"GROQ_API_KEY": "g", "CEREBRAS_API_KEY": "c", "HF_TOKEN": "h", "LLM_PROVIDER_FALLBACKS": "huggingface, ollama, unknown"}, resolve_chain)
    assert [config.provider for config in explicit] == ["groq", "huggingface", "ollama"]
    disabled = with_env({"GROQ_API_KEY": "g", "CEREBRAS_API_KEY": "c", "LLM_PROVIDER_FALLBACKS": "none"}, resolve_chain)
    assert [config.provider for config in disabled] == ["groq"]
    assert with_env({}, resolve_chain) == []
