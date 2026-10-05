"""Phase 13b: universe strategies, research runs and comparisons (synthetic data, no network)."""

from __future__ import annotations

import asyncio

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.deps import get_store
from backend.main import app
from backend.models.research_runs import CompareRequest, RunRequest, RunSettings, StrategySpec
from backend.research import snapshots
from backend.research.snapshots import build_snapshot
from backend.research.universe import EligibilityRules, eligible_at, rebalance_indices
from backend.services import rate_limiter, research_runs
from backend.strategies import REGISTRY
from backend.strategies.portfolio_base import DecisionContext, apply_caps, trailing_volatility
from backend.strategies.portfolio_strategies import get_portfolio_strategy, list_portfolio_strategies
from backend.strategies.vol_trend import portfolio_volatility
from backend.tests.helpers import make_panel_frames


def _frames(closes: dict, start: str = "2023-01-02", volume: float = 1_000_000.0):
    n = len(next(iter(closes.values())))
    index = pd.bdate_range(start, periods=n).tz_localize("Asia/Kolkata")
    frames = {}
    for symbol, close in closes.items():
        close = np.asarray(close, dtype=float)
        frames[symbol] = pd.DataFrame(
            {"Open": close, "High": close, "Low": close, "Close": close, "Adj Close": close, "Volume": volume, "Dividends": 0.0, "Stock Splits": 0.0},
            index=index,
        )
    bench = pd.DataFrame({"Close": 1000 * np.ones(n), "Adj Close": 1000 * np.linspace(1, 1.1, n)}, index=index)
    return frames, bench


def _snap(frames, bench, universe="test"):
    return build_snapshot(frames, bench, universe=universe, benchmark_symbol="^TEST", source="synthetic", downloaded_at="2026-01-01T00:00:00+00:00", survivorship_biased=True, caveats=["Synthetic survivorship caveat."])


def _trend_snapshot(n=400):
    rates = {"A.NS": 0.0010, "B.NS": 0.0008, "C.NS": 0.0006, "D.NS": 0.0004, "E.NS": 0.0002, "F.NS": -0.0002}
    closes = {symbol: 100 * np.exp(rate * np.arange(n)) for symbol, rate in rates.items()}
    return _snap(*_frames(closes))


def _ctx(snap, t, warm, previous=None, sectors=None):
    return DecisionContext(eligible=eligible_at(snap, t, EligibilityRules(min_history=warm)), previous=previous, sectors=sectors or {})


# ---------------------------------------------------------------------------------------------
# Registry & metadata


def test_universe_registry_is_separate_and_described():
    ids = {item["id"] for item in list_portfolio_strategies()}
    assert ids == {"xs-momentum", "vol-trend", "equal-weight-universe", "ml-ranking"}
    assert not ids & set(REGISTRY)  # single-asset registry (and its golden baselines) untouched
    for item in list_portfolio_strategies():
        meta = item["metadata"]
        assert meta["executionMode"] == "universe" and meta["maturity"] in {"baseline", "research"}
        assert meta["dataRequirements"] and meta["warmupSessions"] >= 1 and meta["rebalance"] in {"monthly", "weekly"} and meta["riskControls"]
    assert get_portfolio_strategy("equal-weight-universe").maturity == "baseline"
    assert get_portfolio_strategy("xs-momentum").maturity == "research"


def test_single_asset_strategies_declare_metadata():
    for strategy in REGISTRY.values():
        meta = strategy.describe()["metadata"]
        assert meta["executionMode"] == "single-asset" and meta["maturity"] == "baseline" and meta["warmupSessions"] >= 1
    assert "own trailing return" in REGISTRY["momentum"].description


# ---------------------------------------------------------------------------------------------
# Cross-sectional momentum


def test_xs_momentum_hand_checked_ranks():
    snap = _trend_snapshot()
    strategy = get_portfolio_strategy("xs-momentum")
    params = strategy.parse_params({"lookback": 126, "skip": 21, "holdings": 2, "maxWeight": 0.5, "sectorCap": 1.0})
    t = 300
    decision = strategy.decide(snap.view(t), _ctx(snap, t, 127), params)
    assert decision.weights == pytest.approx({"A.NS": 0.5, "B.NS": 0.5})
    assert decision.reasons["A.NS"].startswith("Rank 1 of 6")


def test_xs_momentum_ties_are_deterministic():
    n = 300
    closes = {symbol: 100 * np.exp(0.0005 * np.arange(n)) for symbol in ("Z.NS", "M.NS", "A.NS")}
    snap = _snap(*_frames(closes))
    strategy = get_portfolio_strategy("xs-momentum")
    params = strategy.parse_params({"lookback": 126, "skip": 0, "holdings": 2, "maxWeight": 0.5, "sectorCap": 1.0})
    decision = strategy.decide(snap.view(250), _ctx(snap, 250, 127), params)
    assert set(decision.weights) == {"A.NS", "M.NS"}


def test_xs_momentum_ignores_the_future():
    frames, bench, _ = make_panel_frames(("AAA.NS", "BBB.NS", "CCC.NS", "DDD.NS"), n=400)
    snap = _snap(frames, bench)
    strategy = get_portfolio_strategy("xs-momentum")
    params = strategy.parse_params({"lookback": 126, "skip": 21, "holdings": 2, "maxWeight": 0.6, "sectorCap": 1.0})
    t = 250
    before = strategy.decide(snap.view(t), _ctx(snap, t, 127), params)
    arrays = {name: values.copy() for name, values in snap.arrays.items()}
    for values in arrays.values():
        values[t + 1 :] *= 3.0  # rewrite the future
    mutated = snapshots.Snapshot(**{**snap.__dict__, "arrays": arrays})
    after = strategy.decide(mutated.view(t), _ctx(mutated, t, 127), params)
    assert before.weights == after.weights and before.reasons == after.reasons


def test_hold_buffer_keeps_incumbents():
    snap = _trend_snapshot()
    strategy = get_portfolio_strategy("xs-momentum")
    params = strategy.parse_params({"lookback": 126, "skip": 21, "holdings": 2, "holdBuffer": 2, "maxWeight": 0.5, "sectorCap": 1.0})
    previous = research_runs.Decision(weights={"A.NS": 0.5, "C.NS": 0.5})
    decision = strategy.decide(snap.view(300), _ctx(snap, 300, 127, previous=previous), params)
    assert set(decision.weights) == {"A.NS", "C.NS"}  # C ranks 3rd, inside top 4, so it stays instead of B
    assert decision.reasons["C.NS"].startswith("Kept: rank 3")
    no_buffer = strategy.decide(snap.view(300), _ctx(snap, 300, 127, previous=previous), strategy.parse_params({"lookback": 126, "skip": 21, "holdings": 2, "maxWeight": 0.5, "sectorCap": 1.0}))
    assert set(no_buffer.weights) == {"A.NS", "B.NS"} and no_buffer.reasons["C.NS"].startswith("Fell to rank 3")


def test_caps_hold_and_excess_is_redistributed_or_cash():
    sectors = {"A": "Bank", "B": "Bank", "C": "Bank", "D": "IT"}
    capped = apply_caps({"A": 0.25, "B": 0.25, "C": 0.25, "D": 0.25}, sectors, max_weight=0.3, sector_cap=0.5)
    bank = capped["A"] + capped["B"] + capped["C"]
    assert bank <= 0.5 + 1e-9 and max(capped.values()) <= 0.3 + 1e-9
    assert capped["D"] == pytest.approx(0.3)  # absorbed what it could
    assert sum(capped.values()) == pytest.approx(0.8)  # the rest stays in cash
    single = apply_caps({"A": 1.0}, {"A": "Bank"}, max_weight=0.2, sector_cap=1.0)
    assert single == {"A": pytest.approx(0.2)}


def test_inverse_vol_weighting_differs_from_equal():
    frames, bench, _ = make_panel_frames(("AAA.NS", "BBB.NS", "CCC.NS", "DDD.NS"), n=400)
    snap = _snap(frames, bench)
    strategy = get_portfolio_strategy("xs-momentum")
    base = {"lookback": 126, "skip": 21, "holdings": 3, "maxWeight": 1.0, "sectorCap": 1.0}
    equal = strategy.decide(snap.view(300), _ctx(snap, 300, 127), strategy.parse_params(base))
    inverse = strategy.decide(snap.view(300), _ctx(snap, 300, 127), strategy.parse_params(base | {"weighting": "inverse_vol"}))
    assert set(equal.weights) == set(inverse.weights)
    assert sum(inverse.weights.values()) == pytest.approx(1.0) and inverse.weights != pytest.approx(equal.weights)


def test_invalid_params_rejected():
    strategy = get_portfolio_strategy("xs-momentum")
    with pytest.raises(ValueError):
        strategy.parse_params({"lookback": 63, "skip": 63})
    with pytest.raises(ValueError):
        strategy.parse_params({"unknown": 1})


# ---------------------------------------------------------------------------------------------
# Volatility-managed trend


def _vol_snapshot(n=400, spike_at=None):
    rng = np.random.default_rng(4)
    noise = {symbol: rng.standard_normal(n) for symbol in ("LOW.NS", "HIGH.NS")}  # identical draws with or without a spike
    closes = {}
    for symbol, sigma in (("LOW.NS", 0.005), ("HIGH.NS", 0.02)):
        returns = 0.001 + sigma * noise[symbol]
        if spike_at is not None and symbol == "LOW.NS":
            returns[spike_at:] = 0.001 + 0.05 * noise[symbol][spike_at:]
        closes[symbol] = 100 * np.cumprod(1 + returns)
    return _snap(*_frames(closes))


def test_vol_target_scales_inversely_to_volatility_and_fixed_does_not():
    snap = _vol_snapshot()
    strategy = get_portfolio_strategy("vol-trend")
    t = 350
    ctx = _ctx(snap, t, 253)
    targeted = strategy.decide(snap.view(t), ctx, strategy.parse_params({"targetVol": 0.05, "maxWeight": 1.0}))
    fixed = strategy.decide(snap.view(t), ctx, strategy.parse_params({"sizing": "fixed", "maxWeight": 1.0}))
    vol = trailing_volatility(snap.view(t).field("adj_close"), t, 63)
    low, high = snap.symbols.index("LOW.NS"), snap.symbols.index("HIGH.NS")
    # fixed = strength / N, so targeted / fixed isolates the volatility scaling.
    scale_low = targeted.weights["LOW.NS"] / fixed.weights["LOW.NS"]
    scale_high = targeted.weights["HIGH.NS"] / fixed.weights["HIGH.NS"]
    assert scale_low / scale_high == pytest.approx(vol[high] / vol[low], rel=1e-6)
    # The book's estimated volatility hits the target (no caps bind at 5%).
    columns = [low, high]
    estimate = portfolio_volatility(snap.view(t).field("adj_close"), t, 63, columns, np.array([targeted.weights["LOW.NS"], targeted.weights["HIGH.NS"]]))
    assert estimate == pytest.approx(0.05, rel=1e-6)
    assert sum(targeted.weights.values()) <= 1.0 + 1e-12


def test_vol_spike_cuts_weight_only_after_it_is_observed():
    spike = 330
    calm, spiky = _vol_snapshot(), _vol_snapshot(spike_at=spike)
    strategy = get_portfolio_strategy("vol-trend")
    params = strategy.parse_params({"targetVol": 0.05, "maxWeight": 1.0})
    before_calm = strategy.decide(calm.view(spike - 1), _ctx(calm, spike - 1, 253), params)
    before_spiky = strategy.decide(spiky.view(spike - 1), _ctx(spiky, spike - 1, 253), params)
    assert before_calm.weights.get("LOW.NS") == pytest.approx(before_spiky.weights.get("LOW.NS"))
    after = strategy.decide(spiky.view(spike + 40), _ctx(spiky, spike + 40, 253), params)
    assert after.weights.get("LOW.NS", 0.0) < before_spiky.weights["LOW.NS"]


def test_downtrend_goes_to_cash_and_warmup_never_trades():
    n = 400
    closes = {"DOWN.NS": 100 * np.exp(-0.001 * np.arange(n)), "UP.NS": 100 * np.exp(0.001 * np.arange(n))}
    snap = _snap(*_frames(closes))
    strategy = get_portfolio_strategy("vol-trend")
    params = strategy.parse_params({})
    decision = strategy.decide(snap.view(350), _ctx(snap, 350, 253), params)
    assert "DOWN.NS" not in decision.weights and decision.weights.get("UP.NS", 0) > 0
    early = strategy.decide(snap.view(200), _ctx(snap, 200, 253), params)
    assert early.weights == {}


# ---------------------------------------------------------------------------------------------
# Runs & comparisons (service)


def _panel(n=420):
    frames, bench, _ = make_panel_frames(("AAA.NS", "BBB.NS", "CCC.NS", "DDD.NS"), n=n)
    return _snap(frames, bench)


def _settings(snap, **overrides):
    base = {"datasetVersion": snap.version, "capital": 2_000_000, "minMedianTradedValueInr": 0, "priceFloor": 0}
    return base | overrides


def test_execute_reports_metrics_benchmark_and_caveats():
    snap = _panel()
    request = RunRequest(**_settings(snap), strategy="xs-momentum", params={"lookback": 126, "skip": 21, "holdings": 2, "maxWeight": 0.6, "sectorCap": 1.0})
    record = research_runs.execute(snap, request, request)
    assert record["engineVersion"] == 2 and record["dataset"]["version"] == snap.version and record["dataset"]["survivorshipBiased"]
    assert record["metrics"]["totalReturn"] is not None and record["benchmark"]["available"]
    assert any("survivorship" in caveat.lower() for caveat in record["caveats"])
    assert record["strategy"]["metadata"]["maturity"] == "research"
    first_fill = min(fill["date"] for fill in record["fills"])
    assert first_fill > snap.dates[127].isoformat()  # nothing trades before the lookback warm-up
    again = research_runs.execute(snap, request, request)
    assert again["resultHash"] == record["resultHash"]


def test_execute_rejects_bad_inputs():
    snap = _panel()
    with pytest.raises(research_runs.RunError):
        bad = RunRequest(**_settings(snap), strategy="nope")
        research_runs.execute(snap, bad, bad)
    with pytest.raises(research_runs.RunError):
        bad = RunRequest(**_settings(snap), strategy="xs-momentum", params={"holdings": 0})
        research_runs.execute(snap, bad, bad)


def test_compare_adds_baseline_and_cost_stress():
    request = CompareRequest(
        datasetVersion="0" * 64,
        strategies=[StrategySpec(strategy="xs-momentum", params={"lookback": 126}), StrategySpec(strategy="vol-trend")],
    )
    specs = research_runs.compare_specs(request)
    labels = [(spec.strategy, multiplier) for spec, multiplier in specs]
    assert labels == [("xs-momentum", 1.0), ("xs-momentum", 2.0), ("vol-trend", 1.0), ("vol-trend", 2.0), ("equal-weight-universe", 1.0)]


def test_cost_stress_lowers_net_return():
    snap = _panel()
    request = RunRequest(**_settings(snap), strategy="vol-trend")
    normal = research_runs.execute(snap, request, request)
    stressed = research_runs.execute(snap, request, request, cost_multiplier=2.0)
    assert stressed["summary"]["totalCosts"] > normal["summary"]["totalCosts"]
    assert stressed["metrics"]["totalReturn"] < normal["metrics"]["totalReturn"]
    assert stressed["label"].endswith("(costs x2)")


# ---------------------------------------------------------------------------------------------
# API


def test_research_run_api_flow():
    rate_limiter.reset()
    client = TestClient(app)
    signup = client.post("/api/auth/signup", json={"email": "rr-flow@example.com", "password": "Tr1cky-Horse-42", "name": "R"})
    headers = {"Authorization": f"Bearer {signup.json()['token']}"}
    other = client.post("/api/auth/signup", json={"email": "rr-other@example.com", "password": "Tr1cky-Horse-42", "name": "O"})
    other_headers = {"Authorization": f"Bearer {other.json()['token']}"}
    snap = _panel()

    async def save():
        await snapshots.save_snapshot(await get_store(), snap)

    asyncio.run(save())
    strategies = client.get("/api/research-runs/strategies", headers=headers).json()
    assert {item["id"] for item in strategies} == {"xs-momentum", "vol-trend", "equal-weight-universe", "ml-ranking"}

    body = _settings(snap) | {"strategy": "xs-momentum", "params": {"lookback": 126, "holdings": 2, "maxWeight": 0.6, "sectorCap": 1.0}}
    run = client.post("/api/research-runs", headers=headers, json=body)
    assert run.status_code == 200, run.text
    run_id = run.json()["id"]
    assert "fills" not in run.json() and run.json()["counts"]["fills"] > 0
    detail = client.get(f"/api/research-runs/{run_id}", headers=headers).json()
    assert detail["series"]["equity"] and detail["assumptions"]["eligibility"]
    fills = client.get(f"/api/research-runs/{run_id}/fills?limit=5", headers=headers).json()
    assert len(fills["items"]) == 5 and fills["items"][0]["date"] >= fills["items"][-1]["date"] and fills["items"][0]["reason"]
    holdings = client.get(f"/api/research-runs/{run_id}/holdings", headers=headers).json()
    assert holdings["positions"] and holdings["decision"]["weights"]
    assert client.get(f"/api/research-runs/{run_id}", headers=other_headers).status_code == 404
    assert client.get("/api/research-runs/" + "a" * 32, headers=headers).status_code == 404

    bad = client.post("/api/research-runs", headers=headers, json=body | {"params": {"lookback": 5}})
    assert bad.status_code == 422 and "lookback" in bad.json()["detail"]
    missing = client.post("/api/research-runs", headers=headers, json=body | {"datasetVersion": "e" * 64})
    assert missing.status_code == 404
    assert client.post("/api/research-runs", headers=headers, json=body | {"extra": 1}).status_code == 422

    compare = client.post(
        "/api/research-runs/compare",
        headers=headers,
        json=_settings(snap) | {"strategies": [{"strategy": "vol-trend"}, {"strategy": "vol-trend", "params": {"sizing": "fixed"}}]},
    )
    assert compare.status_code == 200, compare.text
    comparison = compare.json()
    labels = [row["label"] for row in comparison["rows"]]
    assert len(labels) == 5 and "Baseline: equal-weight universe" in labels and sum("costs x2" in label for label in labels) == 2
    assert len(comparison["series"]["runs"]) == 5 and comparison["series"]["runs"][0]["equity"][0]["value"] == pytest.approx(100.0)
    linked = client.get(f"/api/research-runs/{comparison['rows'][0]['runId']}", headers=headers).json()
    assert linked["comparisonId"] == comparison["id"]
    listed = client.get("/api/research-runs", headers=headers).json()
    assert listed[0]["kind"] == "comparison" and any(item["kind"] == "run" and item["headline"]["totalReturn"] is not None for item in listed)
    assert client.get("/api/research-runs", headers=other_headers).json() == []


def test_every_universe_strategy_ignores_the_future():
    frames, bench, _ = make_panel_frames(("AAA.NS", "BBB.NS", "CCC.NS", "DDD.NS"), n=420)
    snap = _snap(frames, bench)
    arrays = {name: values.copy() for name, values in snap.arrays.items()}
    t = 300
    rng = np.random.default_rng(9)
    for values in arrays.values():
        values[t + 1 :] *= rng.uniform(0.2, 5.0, size=values[t + 1 :].shape)  # scramble the future
    mutated = snapshots.Snapshot(**{**snap.__dict__, "arrays": arrays})
    for item in list_portfolio_strategies():
        strategy = get_portfolio_strategy(item["id"])
        params = strategy.parse_params({})
        warm = strategy.warmup_sessions(params)
        before = strategy.decide(snap.view(t), _ctx(snap, t, warm), params)
        after = strategy.decide(mutated.view(t), _ctx(mutated, t, warm), params)
        assert before.weights == after.weights and before.reasons == after.reasons, item["id"]
