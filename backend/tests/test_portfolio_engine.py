"""Phase 13a: research snapshots, universes, fee schedules and the portfolio engine (no network)."""

from __future__ import annotations

import asyncio
from datetime import date

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.deps import get_store
from backend.main import app
from backend.research import snapshots
from backend.research.snapshots import SnapshotError, build_snapshot
from backend.research.universe import EligibilityRules, describe_universes, eligible_at, rebalance_indices, universe_symbols
from backend.services import rate_limiter
from backend.services.cost_model import COMPONENTS, get_schedule, nse_delivery, scaled
from backend.services.portfolio_engine import Decision, EngineConfig, EngineError, collect_decisions, run_portfolio
from backend.tests.helpers import make_panel_frames

SYMBOLS = ("AAA.NS", "BBB.NS", "CCC.NS", "DDD.NS")
NO_COSTS = EngineConfig(capital=1_000_000.0, fee_schedule="flat-bps", cost_bps=0.0, slippage_bps=0.0)


def _snapshot(n: int = 260, cut: int | None = None):
    frames, benchmark, info = make_panel_frames(SYMBOLS, n=n)
    if cut is not None:  # cut by date (the late listing's frame starts later)
        cutoff = frames[SYMBOLS[0]].index[cut]
        frames = {symbol: frame[frame.index < cutoff] for symbol, frame in frames.items()}
        benchmark = benchmark[benchmark.index < cutoff]
    snap = build_snapshot(
        frames,
        benchmark,
        universe="test",
        benchmark_symbol="^TEST",
        source="synthetic",
        downloaded_at="2026-01-01T00:00:00+00:00",
        survivorship_biased=True,
        caveats=["synthetic"],
    )
    return snap, info


def _cash_trace(result, capital):
    """Rebuild cash per session from fills and dividends only."""
    by_day = {}
    for fill in result["fills"]:
        delta = fill["notional"] - fill["costTotal"] if fill["side"] == "sell" else -(fill["notional"] + fill["costTotal"])
        by_day[fill["date"]] = by_day.get(fill["date"], 0.0) + delta
    for dividend in result["dividends"]:
        by_day[dividend["date"]] = by_day.get(dividend["date"], 0.0) + dividend["amount"]
    cash, out = capital, []
    for ts in result["_series"]["cash"].index:
        cash += by_day.get(ts.date().isoformat(), 0.0)
        out.append(cash)
    return np.array(out)


# ---------------------------------------------------------------------------------------------
# Snapshots


def test_calendar_drops_holiday_placeholders_and_weekend_sessions():
    snap, info = _snapshot()
    assert info["holiday"] not in snap.dates
    assert info["weekend"] not in snap.dates
    assert snap.meta["excludedDates"]["noTrading"] == [info["holiday"].isoformat()]
    assert snap.meta["excludedDates"]["weekend"] == [info["weekend"].isoformat()]
    assert all(day.weekday() < 5 for day in snap.dates)
    # Benchmark aligned to the universe calendar, with its own gap reported.
    assert snap.meta["benchmarkCoverage"]["missing"] == 1


def test_late_listing_and_zero_volume_recorded():
    snap, info = _snapshot()
    coverage = {item["symbol"]: item for item in snap.meta["coverage"]}
    assert coverage["DDD.NS"]["firstDate"] > snap.dates[0].isoformat()
    assert coverage["BBB.NS"]["zeroVolumeSessions"] == 1
    assert coverage["AAA.NS"]["dividends"] == 1
    assert snap.meta["survivorshipBiased"] is True and snap.meta["coverageSummary"]["lateListings"] == 1


def test_version_is_content_addressed_and_round_trips():
    first, _ = _snapshot()
    second, _ = _snapshot()
    assert first.version == second.version and len(first.version) == 64
    blob = snapshots.serialize(first)
    loaded = snapshots.deserialize(blob)
    assert loaded.version == first.version and loaded.dates == first.dates
    assert np.array_equal(loaded.arrays["close"], first.arrays["close"], equal_nan=True)
    shorter, _ = _snapshot(cut=200)
    assert shorter.version != first.version


def test_tampered_snapshot_fails_verification():
    snap, _ = _snapshot()
    meta = dict(snap.meta)
    meta["version"] = "0" * 64
    tampered = snapshots.Snapshot(**{**snap.__dict__, "meta": meta, "version": "0" * 64})
    with pytest.raises(SnapshotError):
        snapshots.deserialize(snapshots.serialize(tampered))


def test_snapshot_arrays_are_read_only():
    snap, _ = _snapshot()
    with pytest.raises(ValueError):
        snap.arrays["close"][0, 0] = 1.0
    with pytest.raises(ValueError):
        snap.view(10).field("close")[0, 0] = 1.0


# ---------------------------------------------------------------------------------------------
# Universe, eligibility, rebalance calendar


def test_nifty_universes_come_from_catalog_tiers():
    assert len(universe_symbols("nifty50-current")) == 50
    assert len(universe_symbols("nifty100-current")) == 100
    described = {item["id"]: item for item in describe_universes()}
    assert described["nifty100-current"]["survivorshipBiased"] is True and described["nifty100-current"]["caveats"]


def test_eligibility_uses_only_data_up_to_t():
    snap, _ = _snapshot()
    rules = EligibilityRules(min_history=40, min_median_traded_value=1.0, price_floor=1.0)
    t = 70
    before = eligible_at(snap, t, rules)
    mutated_arrays = {name: values.copy() for name, values in snap.arrays.items()}
    for values in mutated_arrays.values():
        values[t + 1 :] = np.nan  # wipe the future
    mutated = snapshots.Snapshot(**{**snap.__dict__, "arrays": mutated_arrays})
    assert np.array_equal(before, eligible_at(mutated, t, rules))
    late = snap.symbols.index("DDD.NS")
    assert not eligible_at(snap, 59, rules)[late]  # not listed yet
    assert not eligible_at(snap, 80, rules)[late]  # listed at 60, only 21 bars of history
    assert eligible_at(snap, 110, rules)[late]


def test_zero_volume_symbol_is_not_eligible_that_session():
    snap, _ = _snapshot()
    j = snap.symbols.index("BBB.NS")
    zero_day = int(np.flatnonzero(snap.arrays["volume"][:, j] == 0)[0])
    assert not eligible_at(snap, zero_day)[j]
    assert eligible_at(snap, zero_day + 1)[j]


def test_monthly_rebalance_is_last_session_of_each_month():
    snap, _ = _snapshot()
    indices = rebalance_indices(snap, "monthly")
    for i in indices:
        assert snap.dates[i + 1].month != snap.dates[i].month
    assert snap.sessions - 1 not in indices  # the final month can't be known to have ended


# ---------------------------------------------------------------------------------------------
# Fee schedules


def test_nse_delivery_breakdown_and_versions():
    schedule = nse_delivery()
    notional = 100_000.0
    buy = schedule.costs("buy", notional, date(2025, 6, 2))
    sell = schedule.costs("sell", notional, date(2025, 6, 2))
    assert buy["stt"] == pytest.approx(100.0) and sell["stt"] == pytest.approx(100.0)
    assert buy["stamp"] == pytest.approx(15.0) and sell["stamp"] == 0.0
    assert buy["exchange"] == pytest.approx(3.07) and buy["sebi"] == pytest.approx(0.1)
    assert buy["gst"] == pytest.approx(0.18 * (buy["exchange"] + buy["sebi"]))  # not on STT/stamp
    assert sell["dp"] == pytest.approx(15.34) and buy["dp"] == 0.0
    assert schedule.costs("sell", notional, date(2025, 6, 2), first_sell_of_scrip_today=False)["dp"] == 0.0
    for costs in (buy, sell):
        assert costs["total"] == pytest.approx(sum(costs[c] for c in COMPONENTS))
    old = schedule.costs("buy", notional, date(2023, 6, 1))
    assert old["exchange"] != buy["exchange"] and schedule.version_for(date(2023, 6, 1)).approximate
    assert not schedule.version_for(date(2024, 10, 1)).approximate
    for version in schedule.describe()["versions"]:
        assert all(line["source"] and line["checkedOn"] for line in version["lines"])


def test_flat_bps_and_stress():
    flat = get_schedule("flat-bps", cost_bps=5.0)
    assert flat.costs("buy", 10_000.0, date(2025, 1, 1))["total"] == pytest.approx(5.0)
    doubled = scaled(nse_delivery(), 2.0)
    base = nse_delivery().costs("sell", 50_000.0, date(2025, 1, 1))["total"]
    assert doubled.costs("sell", 50_000.0, date(2025, 1, 1))["total"] == pytest.approx(2 * base)


# ---------------------------------------------------------------------------------------------
# Engine


def _hold(symbols_weights):
    return Decision(weights=dict(symbols_weights), reasons={symbol: "test" for symbol in symbols_weights})


def test_decision_fills_at_next_open_and_last_decision_stays_pending():
    snap, _ = _snapshot()
    t = 30
    result = run_portfolio(snap, {t: _hold({"AAA.NS": 0.5}), snap.sessions - 1: _hold({"BBB.NS": 0.5})}, NO_COSTS)
    first = result["fills"][0]
    assert first["date"] == snap.dates[t + 1].isoformat() and first["decidedOn"] == snap.dates[t].isoformat()
    j = snap.symbols.index("AAA.NS")
    assert first["price"] == pytest.approx(snap.arrays["open"][t + 1, j])
    assert {order["symbol"] for order in result["pending"]} == {"AAA.NS", "BBB.NS"}
    assert all(fill["date"] != snap.dates[-1].isoformat() or fill["decidedOn"] != snap.dates[-1].isoformat() for fill in result["fills"])


def test_cash_reconciles_every_session_and_never_goes_negative():
    snap, _ = _snapshot()
    decisions = {i: _hold({"AAA.NS": 0.3, "BBB.NS": 0.3, "CCC.NS": 0.35}) if k % 2 == 0 else _hold({"CCC.NS": 0.5, "DDD.NS": 0.45}) for k, i in enumerate(rebalance_indices(snap, "monthly"))}
    config = EngineConfig(capital=500_000.0, slippage_bps=10.0)
    result = run_portfolio(snap, decisions, config)
    cash = result["_series"]["cash"].to_numpy()
    assert np.allclose(cash, _cash_trace(result, config.capital), atol=1e-6 * config.capital)
    assert cash.min() >= -1e-9
    assert result["summary"]["costBreakdown"]["stt"] > 0 and result["summary"]["costBreakdown"]["dp"] > 0
    assert result["summary"]["totalCosts"] == pytest.approx(sum(f["costTotal"] for f in result["fills"]))
    # Equity identity on the last session.
    final_marks = {symbol: snap.arrays["close"][-1, snap.symbols.index(symbol)] for symbol in snap.symbols}
    positions = result["holdings"][-1]["positions"]
    assert result["summary"]["finalEquity"] == pytest.approx(cash[-1] + sum(shares * final_marks[s] for s, shares in positions.items()))


def test_whole_shares_caps_and_gross_limit():
    snap, _ = _snapshot()
    config = EngineConfig(capital=1_000_000.0, fee_schedule="flat-bps", cost_bps=0.0, slippage_bps=0.0, max_position_weight=0.3)
    result = run_portfolio(snap, {20: _hold({"AAA.NS": 0.9, "BBB.NS": 0.9, "CCC.NS": 0.9})}, config)
    assert all(isinstance(fill["shares"], int) for fill in result["fills"])
    exposure = result["_series"]["exposure"]
    assert exposure.max() <= 1.0 + 1e-9
    day = snap.dates[21].isoformat()
    for fill in (f for f in result["fills"] if f["date"] == day):
        decision_close = snap.arrays["close"][20, snap.symbols.index(fill["symbol"])]
        assert fill["shares"] * decision_close <= 0.3 * 1_000_000.0 + 1e-6  # capped at 30%, sized at the decision close


def test_sells_before_buys_fund_a_full_rotation():
    snap, _ = _snapshot()
    result = run_portfolio(snap, {20: _hold({"AAA.NS": 0.99}), 40: _hold({"CCC.NS": 0.99})}, NO_COSTS)
    rotation = [f for f in result["fills"] if f["date"] == snap.dates[41].isoformat()]
    assert [f["side"] for f in rotation] == ["sell", "buy"]
    assert result["_series"]["exposure"].iloc[42 - 0] > 0.9


def test_cash_shortfall_scales_buys_down():
    snap, _ = _snapshot()
    config = EngineConfig(capital=100_000.0, slippage_bps=200.0)  # big slippage: targets at the close no longer fit
    result = run_portfolio(snap, {20: _hold({"AAA.NS": 0.5, "BBB.NS": 0.5})}, config)
    assert min(result["_series"]["cash"]) >= 0
    assert any(event["event"] == "cash_limited" for event in result["orderEvents"])


def test_participation_cap_spreads_orders():
    snap, _ = _snapshot()
    config = EngineConfig(capital=500_000_000.0, fee_schedule="flat-bps", slippage_bps=0.0, participation_cap=0.01)
    result = run_portfolio(snap, {20: _hold({"AAA.NS": 0.5})}, config)
    buys = [f for f in result["fills"] if f["symbol"] == "AAA.NS"]
    assert len(buys) > 1 and len({f["date"] for f in buys}) == len(buys)
    assert any(event["event"] == "participation_capped" for event in result["orderEvents"])


def test_untradable_session_defers_the_order():
    snap, _ = _snapshot()
    j = snap.symbols.index("BBB.NS")
    zero_day = int(np.flatnonzero(snap.arrays["volume"][:, j] == 0)[0])
    result = run_portfolio(snap, {zero_day - 1: _hold({"BBB.NS": 0.5})}, NO_COSTS)
    fill = next(f for f in result["fills"] if f["symbol"] == "BBB.NS")
    assert fill["date"] == snap.dates[zero_day + 1].isoformat()
    assert any(event["event"] == "not_tradable" for event in result["orderEvents"])


def test_dividends_credited_once_and_match_adjusted_total_return():
    snap, info = _snapshot()
    j = snap.symbols.index("AAA.NS")
    ex = int(np.flatnonzero(snap.arrays["dividend"][:, j] > 0)[0])
    config = EngineConfig(capital=10_000_000.0, fee_schedule="flat-bps", slippage_bps=0.0)
    result = run_portfolio(snap, {10: _hold({"AAA.NS": 1.0})}, config)
    assert len(result["dividends"]) == 1 and result["dividends"][0]["date"] == snap.dates[ex].isoformat()
    assert result["dividends"][0]["perShare"] == pytest.approx(info["dividend"])
    # Buying on the ex-date earns nothing.
    late = run_portfolio(snap, {ex - 1: _hold({"AAA.NS": 1.0})}, config)
    assert late["dividends"] == []
    # Through the ex-date, equity growth with the cash credit matches adj_close growth (Yahoo's
    # adjustment reinvests at the prior close, a tiny difference); counting the dividend twice
    # (adjusted prices + credit) would be off by the full 2% yield.
    equity = result["_series"]["equity"].to_numpy()
    adj = snap.arrays["adj_close"][:, j]
    start = 12
    invested = 1 - result["_series"]["cash"].iloc[start] / equity[start]
    expected = 1 + invested * (adj[ex] / adj[start] - 1)
    assert equity[ex] / equity[start] == pytest.approx(expected, rel=1e-3)


def test_engine_is_deterministic_and_future_independent():
    snap, _ = _snapshot()
    decisions = {i: _hold({"AAA.NS": 0.4, "CCC.NS": 0.4}) for i in rebalance_indices(snap, "monthly")}
    config = EngineConfig(capital=750_000.0)
    first = run_portfolio(snap, decisions, config)
    second = run_portfolio(snapshots.deserialize(snapshots.serialize(snap)), decisions, config)
    assert first["resultHash"] == second["resultHash"] and first["configHash"] == second["configHash"]
    # Cutting the future off doesn't change the past.
    short, _ = _snapshot(cut=180)
    k = short.sessions - 1
    cut_decisions = {i: d for i, d in decisions.items() if i < k}
    truncated = run_portfolio(short, cut_decisions, config)
    assert np.allclose(truncated["_series"]["equity"].to_numpy()[: k - 1], first["_series"]["equity"].to_numpy()[: k - 1])


def test_collect_decisions_only_sees_the_past():
    snap, _ = _snapshot()
    seen = []

    def strategy(view):
        seen.append((view.end, view.field("close").shape[0], len(view.dates)))
        return Decision(weights={"AAA.NS": 0.5})

    collect_decisions(snap, [5, 50], strategy)
    assert seen == [(5, 6, 6), (50, 51, 51)]


def test_invalid_configs_and_decisions_are_rejected():
    snap, _ = _snapshot()
    with pytest.raises(EngineError):
        run_portfolio(snap, {}, EngineConfig(max_gross=1.5))
    with pytest.raises(EngineError):
        run_portfolio(snap, {5: Decision(weights={"ZZZ.NS": 0.1})})
    with pytest.raises(EngineError):
        run_portfolio(snap, {5: Decision(weights={"AAA.NS": -0.1})})
    with pytest.raises(EngineError):
        run_portfolio(snap, {}, EngineConfig(fee_schedule="nope"))


def test_missing_bar_marks_at_last_close_and_counts_stale():
    snap, _ = _snapshot()
    j = snap.symbols.index("AAA.NS")
    arrays = {name: values.copy() for name, values in snap.arrays.items()}
    gap = 60
    for name in ("open", "high", "low", "close", "adj_close", "volume"):
        arrays[name][gap, j] = np.nan
    holed = snapshots.Snapshot(**{**snap.__dict__, "arrays": arrays})
    result = run_portfolio(holed, {20: _hold({"AAA.NS": 0.8})}, NO_COSTS)
    assert result["summary"]["staleMarks"] == 1
    equity = result["_series"]["equity"].to_numpy()
    cash = result["_series"]["cash"].to_numpy()
    shares = result["holdings"][-1]["positions"]["AAA.NS"]
    assert equity[gap] == pytest.approx(cash[gap] + shares * arrays["close"][gap - 1, j])


def test_fills_record_the_fee_schedule_version():
    snap, _ = _snapshot()
    result = run_portfolio(snap, {20: _hold({"AAA.NS": 0.5})}, EngineConfig())
    assert result["fills"] and all(f["feeSchedule"] == "nse-delivery" and f["feeVersion"] for f in result["fills"])


def test_no_decisions_keeps_capital():
    snap, _ = _snapshot()
    result = run_portfolio(snap, {}, EngineConfig(capital=123_456.0))
    assert result["summary"]["finalEquity"] == 123_456.0 and result["fills"] == []


# ---------------------------------------------------------------------------------------------
# API


def test_research_data_endpoints():
    rate_limiter.reset()
    client = TestClient(app)
    assert client.get("/api/research-runs/universes").status_code == 401
    signup = client.post("/api/auth/signup", json={"email": "rr-api@example.com", "password": "Tr1cky-Horse-42", "name": "R"})
    headers = {"Authorization": f"Bearer {signup.json()['token']}"}
    universes = client.get("/api/research-runs/universes", headers=headers).json()
    assert any(u["id"] == "nifty100-current" and u["symbolCount"] == 100 and u["survivorshipBiased"] for u in universes)
    schedules = client.get("/api/research-runs/fee-schedules", headers=headers).json()
    assert schedules[0]["id"] == "nse-delivery" and schedules[0]["versions"][-1]["lines"][0]["source"]
    engine = client.get("/api/research-runs/engine", headers=headers).json()
    assert engine["engineVersion"] == 2 and "timing" in engine["assumptions"]

    snap, _ = _snapshot()

    async def save():
        return await snapshots.save_snapshot(await get_store(), snap)

    asyncio.run(save())
    asyncio.run(save())  # idempotent
    listed = client.get("/api/research-runs/datasets", headers=headers).json()
    mine = [item for item in listed if item["version"] == snap.version]
    assert len(mine) == 1 and "coverage" not in mine[0] and mine[0]["survivorshipBiased"] is True
    detail = client.get(f"/api/research-runs/datasets/{snap.version}", headers=headers).json()
    assert len(detail["coverage"]) == 4
    assert client.get("/api/research-runs/datasets/" + "f" * 64, headers=headers).status_code == 404
    assert client.get("/api/research-runs/datasets/not-a-version", headers=headers).status_code == 422

    async def load():
        snapshots.clear_cache()
        return await snapshots.load_snapshot(await get_store(), snap.version)

    assert asyncio.run(load()).version == snap.version
