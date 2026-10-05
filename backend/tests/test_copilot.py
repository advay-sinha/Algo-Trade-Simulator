"""Copilot tool-calling loop with a scripted model (no network, no API key)."""

import asyncio
import json

from langchain_core.messages import AIMessage, ToolMessage

from backend.config import settings
from backend.services import copilot_service
from backend.services import market_data_service as market
from backend.tests.helpers import make_bars


class ScriptedLLM:
    """Stands in for ChatOpenAI: returns queued AIMessages, records what it was sent."""

    def __init__(self, responses=None, always=None, error=None):
        self.responses = list(responses or [])
        self.always = always
        self.error = error
        self.calls = []

    def bind_tools(self, tools):
        self.tool_names = [tool.name for tool in tools]
        return self

    async def ainvoke(self, messages):
        self.calls.append(list(messages))
        if self.error:
            raise self.error
        if self.responses:
            return self.responses.pop(0)
        if self.always:
            return self.always()
        return AIMessage(content="All done.")


def tool_call(name, args, call_id):
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": call_id, "type": "tool_call"}])


def run(user_id, store, message, llm):
    async def collect():
        return [event async for event in copilot_service.stream_chat(user_id, store, message, [], llm_factory=lambda model: llm)]

    return asyncio.run(collect())


def new_store():
    from backend.main import InMemoryStore

    return InMemoryStore()


def fake_history(symbol, range_value):
    bars = make_bars(400)
    points = [
        {"timestamp": ts.isoformat(), "open": r.open, "high": r.high, "low": r.low, "close": r.close, "volume": r.volume}
        for ts, r in bars.iterrows()
    ]

    async def _inner():
        return {"symbol": symbol, "points": points, "source": "live", "currency": "USD"}

    return _inner()


def test_create_simulation_is_scoped_to_the_user_and_echoed():
    store = new_store()
    llm = ScriptedLLM([tool_call("create_simulation", {"symbol": "AAPL", "startingCapital": 25000}, "c1"), AIMessage(content="Created your AAPL simulation.")])
    events = run("alice", store, "Create a simulation for AAPL with 25k", llm)
    types = [e["type"] for e in events]
    assert types == ["tool_start", "tool_end", "message", "actions", "done"]
    assert events[1]["ok"] is True
    assert events[3]["actions"][0]["type"] == "simulation"
    assert events[1]["result"]["currency"] == "INR"
    assert "INR 25,000" in events[3]["actions"][0]["label"]
    assert len(asyncio.run(store.list_simulations("alice"))) == 1
    assert asyncio.run(store.list_simulations("bob")) == []
    assert "create_simulation" in llm.tool_names


def test_invalid_tool_input_is_returned_to_the_model_not_raised():
    store = new_store()
    llm = ScriptedLLM([tool_call("create_simulation", {"symbol": "../etc", "startingCapital": 10}, "c1"), AIMessage(content="That symbol is invalid.")])
    events = run("alice", store, "make a sim", llm)
    end = next(e for e in events if e["type"] == "tool_end")
    assert end["ok"] is False and "Invalid input" in end["error"]
    assert asyncio.run(store.list_simulations("alice")) == []
    tool_messages = [m for m in llm.calls[-1] if isinstance(m, ToolMessage)]
    assert tool_messages and "error" in json.loads(tool_messages[0].content)


def test_tool_budget_caps_calls_and_answers_every_call():
    store = new_store()
    counter = {"n": 0}

    def always_tools():
        counter["n"] += 1
        return AIMessage(content="", tool_calls=[{"name": "portfolio_overview", "args": {}, "id": f"p{counter['n']}a", "type": "tool_call"}, {"name": "list_backtests", "args": {}, "id": f"p{counter['n']}b", "type": "tool_call"}])

    llm = ScriptedLLM(always=always_tools)
    events = run("alice", store, "loop forever", llm)
    starts = [e for e in events if e["type"] == "tool_start"]
    assert len(starts) == 5
    final = next(e for e in events if e["type"] == "message")
    assert final.get("budgetReached") is True
    transcript = llm.calls[-1]
    requested = sum(len(m.tool_calls) for m in transcript if isinstance(m, AIMessage))
    answered = sum(1 for m in transcript if isinstance(m, ToolMessage))
    assert requested == answered  # the provider requires a response to every tool call


def test_backtest_tool_runs_saves_and_reports_risk():
    store = new_store()
    original = market.get_daily_history
    market.get_daily_history = fake_history
    try:
        llm = ScriptedLLM(
            [
                tool_call("run_backtest", {"symbol": "AAPL", "strategy": "sma-crossover", "params": {"shortWindow": 20, "longWindow": 60}, "startingCapital": 100000}, "b1"),
                AIMessage(content="Backtest complete."),
            ]
        )
        events = run("alice", store, "Backtest AAPL with 20/60 SMA and 100k capital", llm)
    finally:
        market.get_daily_history = original
    end = next(e for e in events if e["type"] == "tool_end")
    assert end["ok"] is True, end
    assert "sharpe" in end["result"]["risk"] and end["result"]["summary"]["startingCapital"] == 100000
    saved = asyncio.run(store.list_backtests("alice"))
    assert len(saved) == 1 and saved[0]["id"] == end["result"]["backtestId"]
    assert next(e for e in events if e["type"] == "actions")["actions"][0]["path"] == f"/backtests/{saved[0]['id']}"


def test_reports_of_other_users_are_not_visible():
    store = new_store()
    backtest = asyncio.run(store.add_backtest("bob", {"symbol": "X", "summary": {}, "trades": [], "strategy": {}, "config": {}, "period": {}}))
    llm = ScriptedLLM([tool_call("get_backtest_report", {"backtest_id": backtest["id"]}, "r1"), AIMessage(content="Not found.")])
    events = run("alice", store, "explain that backtest", llm)
    end = next(e for e in events if e["type"] == "tool_end")
    assert end["ok"] is False and "not found" in end["error"].lower()


def test_provider_errors_are_masked():
    class AuthenticationError(Exception):
        status_code = 401

    store = new_store()
    llm = ScriptedLLM(error=AuthenticationError("Incorrect API key provided: sk-secret"))
    events = run("alice", store, "hi", llm)
    error = next(e for e in events if e["type"] == "error")
    assert error["message"] == copilot_service.AUTH_FAILED
    assert "sk-" not in json.dumps(events)


def test_unconfigured_server_explains_itself():
    saved = copilot_service.resolve_llm
    copilot_service.resolve_llm = lambda: None
    try:

        async def collect():
            return [e async for e in copilot_service.stream_chat("alice", new_store(), "hi", [])]

        events = asyncio.run(collect())
    finally:
        copilot_service.resolve_llm = saved
    assert events[0] == {"type": "message", "content": copilot_service.NOT_CONFIGURED}


def test_sse_endpoint_streams_events():
    from fastapi.testclient import TestClient

    from backend.main import app, get_current_user, get_store

    store = new_store()
    llm = ScriptedLLM([tool_call("portfolio_overview", {}, "o1"), AIMessage(content="You have no simulations yet.")])
    original_factory, original_configured = copilot_service.make_llm, copilot_service.configured
    copilot_service.make_llm = lambda model: llm
    copilot_service.configured = lambda: True
    app.dependency_overrides[get_current_user] = lambda: {"id": "alice", "email": "a@example.com", "name": "A", "token": "t"}
    app.dependency_overrides[get_store] = lambda: store
    try:
        with TestClient(app) as client:
            response = client.post("/api/copilot/chat", json={"message": "How is my portfolio?", "history": []})
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
        assert [e["type"] for e in events] == ["tool_start", "tool_end", "message", "done"]
    finally:
        copilot_service.make_llm, copilot_service.configured = original_factory, original_configured
        app.dependency_overrides.clear()


def test_search_symbols_tool_returns_named_matches_with_exchange():
    async def fake_search(query):
        return [
            {"symbol": "GOLDBEES.NS", "shortName": "NIP IND ETF GOLD BEES", "longName": "Nippon India ETF Gold BeES", "exchange": "NSI", "type": "ETF", "source": "live"},
            {"symbol": "GOLD", "shortName": "Barrick Gold Corporation", "exchange": "NYQ", "type": "EQUITY", "source": "live"},
        ]

    original = market.search
    market.search = fake_search
    try:
        llm = ScriptedLLM([tool_call("search_symbols", {"query": "nippon gold etf"}, "s1"), AIMessage(content="GOLDBEES.NS")])
        events = run("alice", new_store(), "find the nippon gold etf", llm)
    finally:
        market.search = original
    end = next(e for e in events if e["type"] == "tool_end")
    assert end["ok"] is True
    first = end["result"]["matches"][0]
    assert first == {"symbol": "GOLDBEES.NS", "name": "Nippon India ETF Gold BeES", "exchange": "NSI", "type": "ETF"}


def test_search_symbols_hides_offline_echoes():
    async def offline_search(query):
        return [{"symbol": query.upper(), "shortName": query.upper(), "exchange": "OFFLINE", "type": "EQUITY", "source": "offline"}]

    original = market.search
    market.search = offline_search
    try:
        llm = ScriptedLLM([tool_call("search_symbols", {"query": "Zerodha Gold"}, "s1"), AIMessage(content="Need the ticker.")])
        events = run("alice", new_store(), "zerodha gold", llm)
    finally:
        market.search = original
    result = next(e for e in events if e["type"] == "tool_end")["result"]
    assert result["matches"] == [] and "note" in result


def test_missing_fallback_model_does_not_mask_the_rate_limit():
    class RateLimitError(Exception):
        status_code = 429

    class NotFoundError(Exception):
        status_code = 404

    errors = {"primary": RateLimitError("slow down"), "bad-fallback": NotFoundError("no such model")}

    class PerModel(ScriptedLLM):
        def __init__(self, model):
            super().__init__(responses=[AIMessage(content="from good fallback")])
            self.model = model

        async def ainvoke(self, messages):
            if self.model in errors:
                raise errors[self.model]
            return await super().ainvoke(messages)

    original = copilot_service._models
    copilot_service._models = lambda: ["primary", "bad-fallback", "good"]
    copilot_service.reset_cooldowns()
    try:
        async def collect():
            return [e async for e in copilot_service.stream_chat("alice", new_store(), "hi", [], llm_factory=PerModel)]

        events = asyncio.run(collect())
        assert next(e for e in events if e["type"] == "message")["content"] == "from good fallback"
        copilot_service._models = lambda: ["primary", "bad-fallback"]
        events = asyncio.run(collect())
        assert next(e for e in events if e["type"] == "error")["message"] == copilot_service.RATE_LIMITED
    finally:
        copilot_service._models = original
        copilot_service.reset_cooldowns()


def test_rate_limited_route_cools_down_and_other_providers_take_over():
    class RateLimitError(Exception):
        status_code = 429

    class ServerError(Exception):
        status_code = 503

    calls = []
    failing = {"groq::a": RateLimitError("tpm"), "groq::b": ServerError("down")}

    class PerRoute(ScriptedLLM):
        def __init__(self, route):
            super().__init__(responses=[AIMessage(content=f"from {route}")])
            self.route = route

        async def ainvoke(self, messages):
            calls.append(self.route)
            if self.route in failing:
                raise failing[self.route]
            return await super().ainvoke(messages)

    original = copilot_service._models
    copilot_service._models = lambda: ["groq::a", "groq::b", "cerebras::c"]
    copilot_service.reset_cooldowns()
    try:

        async def collect():
            return [e async for e in copilot_service.stream_chat("alice", new_store(), "hi", [], llm_factory=PerRoute)]

        events = asyncio.run(collect())
        assert next(e for e in events if e["type"] == "message")["content"] == "from cerebras::c"
        assert calls == ["groq::a", "groq::b", "cerebras::c"]
        calls.clear()
        del failing["groq::b"]
        events = asyncio.run(collect())
        # groq::a is cooling down, so the next healthy route answers without hitting it again.
        assert next(e for e in events if e["type"] == "message")["content"] == "from groq::b"
        assert calls == ["groq::b"]
    finally:
        copilot_service._models = original
        copilot_service.reset_cooldowns()


def test_price_history_tool_reports_instrument_identity():
    async def history_with_meta(symbol, range_value):
        chart = await fake_history(symbol, range_value)
        return {**chart, "currency": "INR", "name": "Nippon India ETF Gold BeES", "exchange": "NSE", "instrumentType": "ETF"}

    original = market.get_daily_history
    market.get_daily_history = history_with_meta
    try:
        llm = ScriptedLLM([tool_call("get_price_history", {"symbol": "GOLDBEES.NS", "range": "1y"}, "h1"), AIMessage(content="Up.")])
        events = run("alice", new_store(), "how did GOLDBEES.NS do", llm)
    finally:
        market.get_daily_history = original
    result = next(e for e in events if e["type"] == "tool_end")["result"]
    assert (result["name"], result["exchange"], result["currency"], result["instrumentType"]) == ("Nippon India ETF Gold BeES", "NSE", "INR", "ETF")


def test_prompt_requires_grounded_figures_and_symbol_resolution():
    from backend.llm.prompts import SYSTEM_PROMPT

    llm = ScriptedLLM([AIMessage(content="ok")])
    run("alice", new_store(), "was my gold etf ok?", llm)
    assert "search_symbols" in llm.tool_names
    assert "search_symbols" in SYSTEM_PROMPT and ".NS" in SYSTEM_PROMPT
    assert "tool results" in llm.calls[-1][-1].content  # closing reminder repeats the grounding rule


def test_rate_limit_mid_task_returns_a_resumable_recap():
    class RateLimitError(Exception):
        status_code = 429

    class ToolThenLimited(ScriptedLLM):
        async def ainvoke(self, messages):
            if self.responses:
                return await super().ainvoke(messages)
            raise RateLimitError("tpm")

    copilot_service.reset_cooldowns()
    try:
        events = run("alice", new_store(), "How is my portfolio?", ToolThenLimited([tool_call("portfolio_overview", {}, "o1")]))
    finally:
        copilot_service.reset_cooldowns()
    assert [e["type"] for e in events] == ["tool_start", "tool_end", "message", "error", "done"]
    recap = next(e for e in events if e["type"] == "message")
    assert recap["paused"] is True and "portfolio_overview" in recap["content"] and "continue" in recap["content"]
    assert next(e for e in events if e["type"] == "error")["message"] == copilot_service.RATE_LIMITED


def test_non_transient_failure_mid_task_has_no_recap():
    class AuthenticationError(Exception):
        status_code = 401

    class ToolThenAuth(ScriptedLLM):
        async def ainvoke(self, messages):
            if self.responses:
                return await super().ainvoke(messages)
            raise AuthenticationError("bad key")

    events = run("alice", new_store(), "How is my portfolio?", ToolThenAuth([tool_call("portfolio_overview", {}, "o1")]))
    assert "message" not in [e["type"] for e in events]
    assert next(e for e in events if e["type"] == "error")["message"] == copilot_service.AUTH_FAILED


def test_progress_note_keeps_ids_and_metrics_and_stays_bounded():
    note = copilot_service.progress_note([
        {"name": "run_backtest", "args": "symbol=AAPL", "result": {"id": "bt1", "summary": {"totalReturn": 0.123456, "buyHoldReturn": 0.2}, "trades": [1, 2]}},
    ])
    assert "run_backtest (symbol=AAPL) -> id=bt1, summary.totalReturn=0.1235, summary.buyHoldReturn=0.2" in note
    long = copilot_service.progress_note([{"name": f"tool{i}", "args": "x" * 150, "result": {}} for i in range(40)])
    assert len(long) <= copilot_service.MAX_PROGRESS_CHARS and long.endswith("(recap truncated)")


def test_continue_after_pause_tells_the_model_not_to_repeat_finished_steps():
    recap = copilot_service.progress_note([{"name": "run_backtest", "args": "symbol=AAPL", "result": {"id": "bt1"}}])
    llm = ScriptedLLM([AIMessage(content="Continuing with MSFT.")])

    async def collect(history):
        return [e async for e in copilot_service.stream_chat("alice", new_store(), "continue", history, llm_factory=lambda model: llm)]

    asyncio.run(collect([{"role": "user", "content": "Backtest AAPL and MSFT"}, {"role": "assistant", "content": recap}]))
    sent = [m.content for m in llm.calls[0]]
    assert sent.index(copilot_service.RESUME_INSTRUCTION) == sent.index("continue") - 1
    llm.calls.clear()
    asyncio.run(collect([{"role": "user", "content": "hi"}, {"role": "assistant", "content": "Hello."}]))
    assert copilot_service.RESUME_INSTRUCTION not in [m.content for m in llm.calls[0]]
