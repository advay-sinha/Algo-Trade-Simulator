"""Copilot orchestration: builds the model + user-scoped tools, runs the tool-calling loop, and
turns everything into a stream of UI events. Provider errors are mapped to generic messages."""

from __future__ import annotations

import importlib.util
import logging
import time
from typing import Any, AsyncIterator, Callable, Dict, List, Optional, Sequence

from backend.config import settings

logger = logging.getLogger("algo_trade_backend.copilot")

NOT_CONFIGURED = "The copilot isn't configured on this server yet. An administrator needs to set up a language-model provider (a free Groq key or a local Ollama works)."
AUTH_FAILED = "The copilot can't sign in to its language-model provider right now. An administrator needs to check the provider API key."
RATE_LIMITED = "Every configured AI provider is rate limiting requests right now. Wait a minute and try again."
GENERIC_FAILURE = "The copilot ran into a problem answering that. Try again in a moment."


def langchain_available() -> bool:
    return importlib.util.find_spec("langchain_openai") is not None and importlib.util.find_spec("langchain_core") is not None


# A route is "provider::model". Bare names (tests, custom factories) mean the primary provider.
ROUTE_SEPARATOR = "::"
COOLDOWN_DEFAULT_SECONDS = 30.0
COOLDOWN_MAX_SECONDS = 120.0
# Best-effort, per process: routes that just rate-limited are tried last until the window passes.
_cooldown_until: Dict[str, float] = {}


def resolve_llm():
    from backend.llm.providers import resolve

    return resolve()


def resolve_llm_chain():
    from backend.llm.providers import resolve_chain

    return resolve_chain()


def configured() -> bool:
    return resolve_llm() is not None and langchain_available()


def provider_info() -> Optional[Dict[str, str]]:
    config = resolve_llm()
    return config.public() if config else None


def _models() -> List[str]:
    """Every route in fallback order: the primary provider's models, then each fallback provider's."""
    routes: List[str] = []
    for config in resolve_llm_chain():
        for name in [config.model, *config.fallbacks]:
            route = f"{config.provider}{ROUTE_SEPARATOR}{name}"
            if name and route not in routes:
                routes.append(route)
    return routes


def make_llm(route: str) -> Any:
    """OpenAI-compatible chat client for one route of the configured chain (Groq, Cerebras, ...)."""
    from langchain_openai import ChatOpenAI

    chain = resolve_llm_chain()
    if not chain:
        raise RuntimeError("No language-model provider configured")
    provider, _, model = route.rpartition(ROUTE_SEPARATOR)
    config = next((item for item in chain if item.provider == provider), chain[0])
    kwargs: Dict[str, Any] = {
        "model": model or config.model,
        "api_key": config.api_key,
        "temperature": settings.openai_temperature,
        "timeout": 60 if config.provider == "ollama" else 30,
        # With somewhere else to go, fail over at once instead of sleeping through the provider's retry window.
        "max_retries": 0 if len(_models()) > 1 else 1,
    }
    if config.base_url:
        kwargs["base_url"] = config.base_url
    if config.provider == "openai" and settings.openai_organization:
        kwargs["organization"] = settings.openai_organization
    return ChatOpenAI(**kwargs)


class _FallbackModel:
    """Tries each route in order when a provider rate-limits or is unavailable. Routes that recently
    rate-limited move to the back of the line so later calls in the same chat skip them."""

    def __init__(self, factory: Callable[[str], Any], tools: Optional[Sequence[Any]]) -> None:
        self.factory = factory
        self.tools = tools

    async def ainvoke(self, messages: Any) -> Any:
        routes = _models() or ["default"]
        now = time.monotonic()
        cooling = [route for route in routes if _cooldown_until.get(route, 0.0) > now]
        ordered = [route for route in routes if route not in cooling] + cooling
        last: Optional[Exception] = None
        skipped: Optional[Exception] = None
        for route in ordered:
            llm = self.factory(route)
            if self.tools:
                llm = llm.bind_tools(list(self.tools))
            try:
                result = await llm.ainvoke(messages)
            except Exception as exc:  # noqa: BLE001
                if _is_retryable(exc):
                    if _is_rate_limited(exc):
                        seconds = _retry_after(exc)
                        _cooldown_until[route] = time.monotonic() + seconds
                        logger.warning("LLM route %s rate limited; trying next fallback (cooldown %.0fs)", route, seconds)
                    else:
                        logger.warning("LLM route %s unavailable (%s); trying next fallback", route, type(exc).__name__)
                    last = last or exc
                    continue
                if last is not None or cooling:
                    # A misconfigured fallback must not mask the rate limit that sent us here.
                    logger.warning("Fallback route %s failed (%s); skipping", route, type(exc).__name__)
                    skipped = skipped or exc
                    continue
                raise
            _cooldown_until.pop(route, None)
            return result
        error = last or skipped
        assert error is not None
        raise error


def reset_cooldowns() -> None:
    """Forget rate-limited routes (tests and local tooling)."""
    _cooldown_until.clear()


def _is_rate_limited(exc: Exception) -> bool:
    return type(exc).__name__ == "RateLimitError" or getattr(exc, "status_code", None) == 429


def _is_retryable(exc: Exception) -> bool:
    if _is_rate_limited(exc) or type(exc).__name__ in ("APIConnectionError", "APITimeoutError", "InternalServerError"):
        return True
    status = getattr(exc, "status_code", None)
    return isinstance(status, int) and status >= 500


def _retry_after(exc: Exception) -> float:
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None) or {}
    try:
        seconds = float(headers.get("retry-after") or COOLDOWN_DEFAULT_SECONDS)
    except (TypeError, ValueError):
        seconds = COOLDOWN_DEFAULT_SECONDS
    return min(max(seconds, 5.0), COOLDOWN_MAX_SECONDS)


def _friendly(exc: Exception) -> str:
    name = type(exc).__name__
    status = getattr(exc, "status_code", None)
    if name == "AuthenticationError" or status == 401:
        return AUTH_FAILED
    if name == "RateLimitError" or status == 429:
        return RATE_LIMITED
    return GENERIC_FAILURE


PAUSED_INTRO = "I had to stop before finishing because every AI provider is rate limiting requests right now."
PAUSED_OUTRO = "Send \"continue\" in a minute and I'll pick up from here without repeating these steps."
MAX_PROGRESS_FACTS = 10
MAX_PROGRESS_CHARS = 3000


def _facts(result: Any) -> str:
    """Short scalar facts (ids, returns, accuracy) from a tool result, one nesting level deep."""
    facts: List[str] = []

    def walk(value: Dict[str, Any], prefix: str) -> None:
        for key, item in value.items():
            if len(facts) >= MAX_PROGRESS_FACTS:
                return
            if isinstance(item, dict) and not prefix:
                walk(item, f"{key}.")
            elif isinstance(item, bool) or isinstance(item, int):
                facts.append(f"{prefix}{key}={item}")
            elif isinstance(item, float):
                facts.append(f"{prefix}{key}={round(item, 4)}")
            elif isinstance(item, str) and len(item) <= 60:
                facts.append(f"{prefix}{key}={item}")

    if isinstance(result, dict):
        walk(result, "")
    return ", ".join(facts)


def progress_note(completed: Sequence[Dict[str, Any]]) -> str:
    """Recap of the tool steps that finished before the run stopped. It is sent as reply text, so it
    comes back in the next turn's history and the model can resume instead of re-running tools."""
    lines = [PAUSED_INTRO, "", "Finished before the pause (ratios are fractions):"]
    for step in completed:
        args = f" ({step['args']})" if step.get("args") else ""
        facts = _facts(step.get("result"))
        lines.append(f"- {step['name']}{args}{f' -> {facts}' if facts else ''}")
    lines += ["", PAUSED_OUTRO]
    note = "\n".join(lines)
    return note if len(note) <= MAX_PROGRESS_CHARS else note[: MAX_PROGRESS_CHARS - 20] + "\n(recap truncated)"


RESUME_INSTRUCTION = (
    "Your previous reply stopped early because of provider rate limits. Every step it lists as finished "
    "is done and saved: do not call those tools again with the same arguments. If the user asks you to "
    "continue, carry on with their original request using those results (look a saved record up by its "
    "id if you need more detail) and run only the steps that are still missing."
)


def resuming_after_pause(history: Sequence[Dict[str, str]]) -> bool:
    last_assistant = next((turn for turn in reversed(history) if turn.get("role") == "assistant"), None)
    return bool(last_assistant) and str(last_assistant.get("content", "")).startswith(PAUSED_INTRO)


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
    if resuming_after_pause(history):
        messages.insert(len(messages) - 1, SystemMessage(content=RESUME_INSTRUCTION))
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
    started: Dict[str, str] = {}
    completed: List[Dict[str, Any]] = []
    try:
        async for event in run_agent(_FallbackModel(factory, tools), _FallbackModel(factory, None), messages, tools):
            if event["type"] == "tool_start":
                started[event["id"]] = event.get("args", "")
            elif event["type"] == "tool_end" and event.get("ok"):
                completed.append({"name": event["name"], "args": started.get(event["id"], ""), "result": event.get("result")})
            yield event
    except Exception as exc:  # noqa: BLE001 - never leak provider error text to clients
        logger.warning("Copilot failed: %s", type(exc).__name__)
        if completed and _is_retryable(exc):
            yield {"type": "message", "content": progress_note(completed), "paused": True}
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
