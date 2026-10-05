"""Phase 13e: copilot tools that explain research runs from recorded evidence (scripted model)."""

from __future__ import annotations

import asyncio
import json

from langchain_core.messages import AIMessage

from backend.llm.prompts import SYSTEM_PROMPT
from backend.models.research_runs import CompareRequest, RunRequest, StrategySpec
from backend.research import snapshots
from backend.research.snapshots import build_snapshot
from backend.services import research_runs
from backend.stores import InMemoryStore
from backend.tests.helpers import make_panel_frames
from backend.tests.test_copilot import ScriptedLLM, run, tool_call


def _store_with_runs():
    frames, bench, _ = make_panel_frames(("AAA.NS", "BBB.NS", "CCC.NS", "DDD.NS"), n=420)
    snap = build_snapshot(frames, bench, universe="test", benchmark_symbol="^TEST", source="synthetic", downloaded_at="2026-01-01T00:00:00+00:00", survivorship_biased=True, caveats=["Survivorship caveat."])
    store = InMemoryStore()
    body = {"datasetVersion": snap.version, "capital": 2_000_000, "minMedianTradedValueInr": 0, "priceFloor": 0}

    async def setup():
        await snapshots.save_snapshot(store, snap)
        run_record = await research_runs.run_for_user(RunRequest(**body, strategy="xs-momentum", params={"lookback": 126, "holdings": 2, "maxWeight": 0.6, "sectorCap": 1.0}), "alice", store)
        comparison = await research_runs.compare_for_user(CompareRequest(**body, strategies=[StrategySpec(strategy="vol-trend")]), "alice", store)
        return run_record, comparison

    run_record, comparison = asyncio.run(setup())
    return store, run_record, comparison


def _tool_results(events):
    return [event for event in events if event["type"] == "tool_end"]


def test_research_tools_report_in_explicit_units_and_explain_from_records():
    store, run_record, comparison = _store_with_runs()
    held = run_record["fills"][0]["symbol"]
    llm = ScriptedLLM(
        [
            tool_call("list_research_runs", {}, "c1"),
            tool_call("get_research_run", {"run_id": run_record["id"]}, "c2"),
            tool_call("explain_position", {"run_id": run_record["id"], "symbol": held}, "c3"),
            tool_call("get_research_run", {"run_id": comparison["id"]}, "c4"),
            AIMessage(content="Explained."),
        ]
    )
    events = run("alice", store, "why did my momentum run buy that stock?", llm)
    ends = _tool_results(events)
    assert [e["ok"] for e in ends] == [True, True, True, True]
    assert {"list_research_runs", "get_research_run", "explain_position", "list_ranking_models"} <= set(llm.tool_names)
    tool_messages = [m for m in llm.calls[-1] if getattr(m, "type", "") == "tool"]
    listed, report, explained, compared = (json.loads(m.content) for m in tool_messages[:4])
    assert any(item["kind"] == "run" and "totalReturnPct" in item for item in listed["runs"])
    assert any(item["kind"] == "comparison" and item["runs"] for item in listed["runs"])
    assert report["survivorshipBiased"] is True and "totalReturnPct" in report and "chargesInr" in report and "totalReturn" not in report
    assert report["totalReturnPct"] == round(run_record["metrics"]["totalReturn"] * 100, 2)
    assert explained["everHeldOrTargeted"] and explained["fills"][0]["reason"].startswith(("Rank", "Kept", "Fell", "No longer"))
    assert all("priceInr" in fill for fill in explained["fills"])
    assert compared["kind"] == "comparison" and any(row["costMultiplier"] == 2.0 for row in compared["rows"])
    assert any(row["label"].startswith("Baseline") for row in compared["rows"])


def test_research_runs_of_other_users_stay_hidden():
    store, run_record, _ = _store_with_runs()
    llm = ScriptedLLM([tool_call("get_research_run", {"run_id": run_record["id"]}, "c1"), tool_call("list_research_runs", {}, "c2"), AIMessage(content="Nothing.")])
    events = run("bob", store, "show me research runs", llm)
    ends = _tool_results(events)
    assert ends[0]["ok"] is False and "not found" in ends[0]["error"].lower()
    listed = json.loads([m for m in llm.calls[-1] if getattr(m, "type", "") == "tool"][1].content)
    assert listed["runs"] == []


def test_explain_position_refuses_a_comparison_id():
    store, _, comparison = _store_with_runs()
    llm = ScriptedLLM([tool_call("explain_position", {"run_id": comparison["id"], "symbol": "AAA.NS"}, "c1"), AIMessage(content="ok")])
    ends = _tool_results(run("alice", store, "explain AAA", llm))
    assert ends[0]["ok"] is False and "comparison" in ends[0]["error"].lower()


def test_prompt_keeps_research_answers_evidence_based():
    text = SYSTEM_PROMPT
    assert "survivorship-biased universe" in text
    assert "never claim a strategy or model will make money" in text
    assert "recorded evidence" in text
