"""Copilot orchestration: builds the model + user-scoped tools, runs the tool-calling loop, and
turns everything into a stream of UI events. Provider errors are mapped to generic messages."""

from __future__ import annotations

import importlib.util
import logging
from typing import Any, AsyncIterator, Callable, Dict, List, Optional, Sequence

from backend.config import settings

logger = logging.getLogger("algo_trade_backend.copilot")

NOT_CONFIGURED = "The copilot isn't configured on this server yet. An administrator needs to set up a language-model provider (a free Groq key or a local Ollama works)."
AUTH_FAILED = "The copilot can't sign in to its language-model provider right now. An administrator needs to check the provider API key."
RATE_LIMITED = "The AI provider is rate limiting requests. Wait a moment and try again."
GENERIC_FAILURE = "The copilot ran into a problem answering that. Try again in a moment."


def langchain_available() -> bool:
    return importlib.util.find_spec("langchain_openai") is not None and importlib.util.find_spec("langchain_core") is not None


def resolve_llm():
    from backend.llm.providers import resolve

    return resolve()


def configured() -> bool:
    return resolve_llm() is not None and langchain_available()


def provider_info() -> Optional[Dict[str, str]]:
    config = resolve_llm()
    return config.public() if config else None


def _models() -> List[str]:
    config = resolve_llm()
    if config is None:
        return []
    seen: List[str] = []
    for name in [config.model, *config.fallbacks]:
        if name and name not in seen:
            seen.append(name)
    return seen


def make_llm(model: str) -> Any:
    """OpenAI-compatible chat client for whichever provider is configured (Groq, Ollama, ...)."""
    from langchain_openai import ChatOpenAI

    config = resolve_llm()
    if config is None:
        raise RuntimeError("No language-model provider configured")
    kwargs: Dict[str, Any] = {
        "model": model,
        "api_key": config.api_key,
        "temperature": settings.openai_temperature,
        "timeout": 60 if config.provider == "ollama" else 30,
        "max_retries": 1,
    }
    if config.base_url:
        kwargs["base_url"] = config.base_url
    if config.provider == "openai" and settings.openai_organization:
        kwargs["organization"] = settings.openai_organization
    return ChatOpenAI(**kwargs)


class _FallbackModel:
    """Tries each configured model in order when the provider rate-limits."""

    def __init__(self, factory: Callable[[str], Any], tools: Optional[Sequence[Any]]) -> None:
        self.factory = factory
        self.tools = tools

    async def ainvoke(self, messages: Any) -> Any:
        last: Optional[Exception] = None
        for model in _models() or ["default"]:
            llm = self.factory(model)
            if self.tools:
                llm = llm.bind_tools(list(self.tools))
            try:
                return await llm.ainvoke(messages)
            except Exception as exc:  # noqa: BLE001
                if _is_rate_limited(exc):
                    logger.warning("Model %s rate limited; trying next fallback", model)
                    last = exc
                    continue
                if last is not None and _is_model_missing(exc):
                    # A misconfigured fallback must not mask the rate limit that sent us here.
                    logger.warning("Fallback model %s is not available on this provider; skipping", model)
                    continue
                raise
        assert last is not None
        raise last


def _is_rate_limited(exc: Exception) -> bool:
    return type(exc).__name__ == "RateLimitError" or getattr(exc, "status_code", None) == 429


def _is_model_missing(exc: Exception) -> bool:
    return type(exc).__name__ in ("NotFoundError", "OpenAIModelNotFoundError") or getattr(exc, "status_code", None) == 404


def _friendly(exc: Exception) -> str:
    name = type(exc).__name__
    status = getattr(exc, "status_code", None)
    if name == "AuthenticationError" or status == 401:
        return AUTH_FAILED
    if name == "RateLimitError" or status == 429:
        return RATE_LIMITED
    return GENERIC_FAILURE


async def stream_chat(
    user_id: str,
    store: Any,
    message: str,
    history: Sequence[Dict[str, str]],
    llm_factory: Optional[Callable[[str], Any]] = None,
) -> AsyncIterator[Dict[str, Any]]:
    """Yields events: sources, tool_start, tool_end, message, actions, error, done."""
    if not configured() and llm_factory is None:
        yield {"type": "message", "content": NOT_CONFIGURED}
        yield {"type": "done"}
        return
    from langchain_core.messages import HumanMessage, SystemMessage

    from backend.llm.langchain_agent import history_to_messages, run_agent
    from backend.llm.prompts import SYSTEM_PROMPT
    from backend.llm.tools import ToolContext, build_tools

    ctx = ToolContext(user_id=user_id, store=store)
    tools = build_tools(ctx)
    factory = llm_factory or make_llm
    messages = [SystemMessage(content=SYSTEM_PROMPT), *history_to_messages(history), HumanMessage(content=message)]
    # Research memory: the user's most relevant saved notes go in as context the model must cite.
    from backend.llm import guardrails, rag

    sources = await rag.retrieve_for_prompt(store, user_id, message)
    if sources:
        messages.insert(1, SystemMessage(content=rag.prompt_context(sources)))
        yield {"type": "sources", "sources": sources}
    # The reminder goes last so it is the final thing the model reads. History is client-supplied,
    # so earlier user turns are scanned too.
    flags = guardrails.detect_in_many([message, *(s.get("snippet", "") for s in sources)])
    history_flags = guardrails.detect_in_many(str(t.get("content", "")) for t in history if t.get("role") == "user")
    if flags or history_flags:
        logger.warning("Copilot prompt-injection flags: message=%s history=%s", ",".join(flags) or "-", ",".join(history_flags) or "-")
    messages.append(SystemMessage(content=guardrails.turn_reminder(flags, history_flags)))
    try:
        async for event in run_agent(_FallbackModel(factory, tools), _FallbackModel(factory, None), messages, tools):
            yield event
    except Exception as exc:  # noqa: BLE001 - never leak provider error text to clients
        logger.warning("Copilot failed: %s", type(exc).__name__)
        yield {"type": "error", "message": _friendly(exc)}
    if ctx.actions:
        yield {"type": "actions", "actions": ctx.actions}
    yield {"type": "done"}


async def collect_chat(user_id: str, store: Any, message: str, history: Sequence[Dict[str, str]], llm_factory: Optional[Callable[[str], Any]] = None) -> Dict[str, Any]:
    """Non-streaming variant for the legacy /chat alias."""
    reply_parts: List[str] = []
    actions: List[Dict[str, Any]] = []
    tools_used: List[str] = []
    citations: List[Dict[str, Any]] = []
    async for event in stream_chat(user_id, store, message, history, llm_factory):
        if event["type"] == "sources":
            citations = [{"id": s["id"], "title": s["title"], "kind": s["kind"], "score": s["score"], "path": s["path"]} for s in event["sources"]]
        elif event["type"] == "message":
            reply_parts.append(event["content"])
        elif event["type"] == "error":
            reply_parts.append(event["message"])
        elif event["type"] == "actions":
            actions = event["actions"]
        elif event["type"] == "tool_end":
            tools_used.append(event["name"])
    return {"reply": "\n\n".join(part for part in reply_parts if part) or GENERIC_FAILURE, "citations": citations, "actions": actions, "toolsUsed": tools_used}
