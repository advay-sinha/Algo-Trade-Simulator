"""Phase 10d: portfolio tool aggregates only, chat masking, note refusal, no-advice steering."""

import asyncio
import json
import re

from langchain_core.messages import AIMessage, ToolMessage

from backend.llm import guardrails, rag
from backend.services import market_data_service as market
from backend.services.research_actions import ActionError
from backend.services import simulation_service
from backend.models.simulation import SimulationInput
from backend.tests.test_copilot import ScriptedLLM, new_store, run, tool_call
from backend.tests.helpers import make_bars

SEEDED = ["ABCPE1234F", "234567890124", "9876543210", "investor.one@example.com", "1208160012345678"]
FORBIDDEN_KEYS = {"quantity", "avgCost", "cost", "pnl", "value", "buyDate", "importId", "createdAt", "lots", "price"}


def _stub_market():
    bars = make_bars(300)
    points = [{"timestamp": ts.isoformat(), "open": r.open, "high": r.high, "low": r.low, "close": r.close} for ts, r in bars.iterrows()]

    async def history(symbol, range_value="1y", interval="1d"):
        return {"symbol": symbol, "points": points, "source": "live", "currency": "INR", "timezone": "Asia/Kolkata"}

    async def quotes(symbols):
        return [{"symbol": s.upper(), "price": 100.0, "currency": "INR", "source": "live"} for s in symbols]

    saved = (market.get_daily_history, market.get_quotes)
    market.get_daily_history, market.get_quotes = history, quotes
    return lambda: setattr(market, "get_daily_history", saved[0]) or setattr(market, "get_quotes", saved[1])


def _keys(obj):
    if isinstance(obj, dict):
        for key, value in obj.items():
            yield key
            yield from _keys(value)
    elif isinstance(obj, list):
        for item in obj:
            yield from _keys(item)


def test_analyze_portfolio_sends_aggregates_only():
    restore = _stub_market()
    try:
        store = new_store()
        holdings = [
            {"symbol": "RELIANCE.NS", "name": "Reliance Industries Limited", "exchange": "NSE", "currency": "INR", "type": "EQ", "sector": "Energy", "assetType": "equity", "quantity": 40, "avgCost": 1234.5, "buyDate": "2025-02-10"},
            {"symbol": "TCS.NS", "name": "Tata Consultancy Services Limited", "exchange": "NSE", "currency": "INR", "type": "EQ", "sector": "IT", "assetType": "equity", "quantity": 7, "avgCost": None, "buyDate": None},
        ]
        asyncio.run(store.add_portfolio_import("alice", {"source": "manual", "rowCount": 2}, holdings))
        llm = ScriptedLLM([tool_call("analyze_portfolio", {}, "p1"), AIMessage(content="Here is what the report shows.")])
        events = run("alice", store, "How diversified is my portfolio?", llm)
        result = next(e for e in events if e["type"] == "tool_end")["result"]
        assert result["holdings"] == 2 and result["observations"]
        assert not FORBIDDEN_KEYS & set(_keys(result))
        tool_message = next(m for m in llm.calls[-1] if isinstance(m, ToolMessage))
        for leaked in ("1234.5", "2025-02-10", '"quantity"'):
            assert leaked not in tool_message.content
    finally:
        restore()


def test_chat_personal_data_is_masked_before_the_model_sees_it():
    llm = ScriptedLLM([AIMessage(content="ok")])
    message = "My PAN ABCPE1234F, Aadhaar 234567890124, phone 9876543210, email investor.one@example.com, BO 1208160012345678 — how risky is TCS?"
    history = [{"role": "user", "content": "earlier I said call 9876543210"}, {"role": "assistant", "content": "Noted."}]

    async def collect():
        return [e async for e in __import__("backend.services.copilot_service", fromlist=["x"]).stream_chat("alice", new_store(), message, history, llm_factory=lambda model: llm)]

    events = asyncio.run(collect())
    sent = "\n".join(str(m.content) for m in llm.calls[-1])
    for value in SEEDED:
        assert value not in sent
    assert "[PAN removed]" in sent and "[phone removed]" in sent and "how risky is TCS?" in sent
    masked = next(e for e in events if e["type"] == "masked")
    assert set(masked["kinds"]) >= {"pan", "aadhaar", "phone", "email", "demat_id"}
    assert "placeholders" in llm.calls[-1][-1].content


def test_notes_with_personal_data_are_refused_whole():
    store = new_store()
    try:
        asyncio.run(rag.create_note(store, "alice", "note", "Broker login", "client id and PAN ABCPE1234F"))
        raise AssertionError("note should be refused")
    except rag.NoteError as exc:
        assert exc.status == 422 and exc.findings[0]["kind"] == "pan" and "ABCPE1234F" not in exc.message
    assert asyncio.run(store.list_notes("alice")) == []
    try:
        asyncio.run(simulation_service.create_simulation_for_user(SimulationInput(symbol="TCS.NS", strategy="momentum", startingCapital=1000, notes="ping 9876543210"), "alice", store))
        raise AssertionError("simulation notes should be refused")
    except ActionError as exc:
        assert "phone number" in exc.message


def test_advice_questions_get_the_no_advice_reminder():
    for question in ["Should I sell RELIANCE?", "should i buy more TCS now", "Is it a good time to exit my HDFC position?", "Which stocks should I sell?", "rebalance my portfolio for me"]:
        assert guardrails.asks_for_advice(question), question
    for neutral in ["How volatile is my portfolio?", "What is my exposure to banks?", "Explain VaR", "how did TCS do this year?"]:
        assert not guardrails.asks_for_advice(neutral), neutral
    llm = ScriptedLLM([AIMessage(content="I can't make that call, but here are the risks.")])
    run("alice", new_store(), "Should I sell RELIANCE?", llm)
    assert "must not decide for them" in llm.calls[-1][-1].content
