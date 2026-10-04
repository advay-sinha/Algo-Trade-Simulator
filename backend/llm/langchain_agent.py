"""Tool-calling loop on LangChain: the model proposes tool calls, we execute them (validated,
user-scoped), feed results back, and stop at a hard per-message budget."""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Dict, List, Optional, Sequence

from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langchain_core.tools import BaseTool
from pydantic import ValidationError

from backend.llm.guardrails import TOOL_RESULT_WARNING, detect_injection, fence
from backend.llm.prompts import BUDGET_REACHED
from backend.llm.tools import STATE_CHANGING
from backend.services.research_actions import ActionError

logger = logging.getLogger("algo_trade_backend.copilot")

MAX_TOOL_CALLS = 5
MAX_TOOL_RESULT_CHARS = 6000


def _summarize_args(args: Dict[str, Any]) -> str:
    parts = [f"{key}={value}" for key, value in args.items() if value not in (None, {}, [])]
    return ", ".join(parts)[:160]


def _tool_error_message(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        first = exc.errors()[0]
        field = ".".join(str(part) for part in first.get("loc", ()))
        return f"Invalid input{f' for {field}' if field else ''}: {first.get('msg')}"
    if isinstance(exc, ActionError):
        return exc.message
    if hasattr(exc, "status_code") and hasattr(exc, "detail"):  # HTTPException from services
        return str(getattr(exc, "detail"))
    return "The tool failed unexpectedly."


async def run_agent(
    llm_with_tools: Any,
    llm_plain: Any,
    messages: List[BaseMessage],
    tools: Sequence[BaseTool],
    max_tool_calls: int = MAX_TOOL_CALLS,
) -> AsyncIterator[Dict[str, Any]]:
    """Yields events: tool_start, tool_end, message. Mutates `messages` with the transcript."""
    by_name = {tool.name: tool for tool in tools}
    used = 0
    while True:
        response: AIMessage = await llm_with_tools.ainvoke(messages)
        messages.append(response)
        calls = list(getattr(response, "tool_calls", None) or [])
        if not calls:
            yield {"type": "message", "content": str(response.content or "")}
            return
        for call in calls:
            call_id = call.get("id") or f"call_{used}"
            name = call.get("name", "")
            args = call.get("args") or {}
            if used >= max_tool_calls:
                # Every tool call must get a response, even the ones we refuse to run.
                messages.append(ToolMessage(content=json.dumps({"skipped": "tool budget reached"}), tool_call_id=call_id))
                continue
            used += 1
            tool = by_name.get(name)
            yield {"type": "tool_start", "id": call_id, "name": name, "args": _summarize_args(args), "stateChanging": name in STATE_CHANGING}
            if tool is None:
                result: Dict[str, Any] = {"error": f"Unknown tool: {name}"}
                ok = False
            else:
                try:
                    result = await tool.ainvoke(args)
                    ok = True
                except Exception as exc:  # noqa: BLE001 - surfaced to the model as data, never raised to the client
                    result = {"error": _tool_error_message(exc)}
                    ok = False
            content = json.dumps(result, default=str)
            if len(content) > MAX_TOOL_RESULT_CHARS:
                content = content[:MAX_TOOL_RESULT_CHARS] + '..."(truncated)"'
            flags = detect_injection(content)
            if flags:
                logger.warning("Tool %s result flagged for prompt injection: %s", name, ",".join(flags))
                content = f"{TOOL_RESULT_WARNING}\n{fence('tool result', content)}"
            messages.append(ToolMessage(content=content, tool_call_id=call_id))
            yield {"type": "tool_end", "id": call_id, "name": name, "ok": ok, "error": None if ok else result.get("error"), "result": result if ok else None}
        if used >= max_tool_calls:
            messages.append(SystemMessage(content=BUDGET_REACHED))
            final: AIMessage = await llm_plain.ainvoke(messages)
            messages.append(final)
            yield {"type": "message", "content": str(final.content or ""), "budgetReached": True}
            return


def history_to_messages(history: Sequence[Dict[str, str]], limit: int = 8) -> List[BaseMessage]:
    from langchain_core.messages import AIMessage as AI, HumanMessage

    converted: List[BaseMessage] = []
    for item in list(history)[-limit:]:
        content = str(item.get("content", ""))[:4000]
        converted.append(AI(content=content) if item.get("role") == "assistant" else HumanMessage(content=content))
    return converted


def first_text(value: Optional[str]) -> str:
    return (value or "").strip()
