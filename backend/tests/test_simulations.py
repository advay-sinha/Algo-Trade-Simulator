"""Forward paper-trading simulations: pure replay rules and the evaluated API (no network)."""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pandas as pd
from fastapi.testclient import TestClient

from backend.main import app
from backend.models.simulation import SimulationInput, SimulationUpdate
from backend.services import market_data_service as market
from backend.services import rate_limiter, simulation_service
from backend.services.simulation_service import ReplayInput, local_dates, replay, session_bounds
from backend.stores import InMemoryStore
from backend.tests.helpers import make_sine_bars

IST = "Asia/Kolkata"


def _ist_bars(n: int = 200) -> pd.DataFrame:
    """Sine bars stamped at IST midnight (like yfinance daily bars for .NS listings)."""
    bars = make_sine_bars(n)
    local = pd.DatetimeIndex([ts.tz_localize(None) for ts in bars.index]).tz_localize(IST)
    return bars.set_index(local.tz_convert("UTC"))


def _input(bars, signals, start_i, *, end=None, history=None, fx=None, capital=100_000.0, cost=0.0, slip=0.0):
    dates = local_dates(bars.index, IST)
    opens = [session_bounds(day, IST)[0] for day in dates]
    return ReplayInput(
        bars=bars,
        signals=signals,
        dates=dates,
        session_opens=opens,
        fx=fx or [1.0] * len(bars),
        capital=capital,
        cost_bps=cost,
        slippage_bps=slip,
        started_at=opens[start_i] - timedelta(hours=1),
        end=end or opens[-1] + timedelta(days=1),
        history=history or [],
        strategy_name="Test strategy",
    )


def test_no_fills_before_start_and_warmup_signal_fills_at_first_open():
    bars = _ist_bars(60)
    signals = [1] * 60  # long everywhere, including warm-up bars
    data = _input(bars, signals, start_i=30)
    result = replay(data)
    assert result["eligible"][0] == 30
    first = result["fills"][0]
    assert first["side"] == "buy" and first["date"] == data.dates[30].isoformat()
    assert "already long" in first["reason"]
    assert len(result["fills"]) == 1  # never sells while the signal stays long


def test_signal_executes_at_next_session_open_with_slippage():
    bars = _ist_bars(40)
    signals = [0] * 40
    signals[25] = 1  # decided at bar 25's close
    signals[26] = 1
    data = _input(bars, signals, start_i=20, slip=10)
    fills = replay(data)["fills"]
    buy, sell = fills[0], fills[1]
    assert buy["date"] == data.dates[26].isoformat()
    assert abs(buy["price"] - bars["open"].iloc[26] * 1.001) < 1e-9
    assert sell["side"] == "sell" and sell["date"] == data.dates[28].isoformat()
    assert abs(sell["price"] - bars["open"].iloc[28] * 0.999) < 1e-9


def test_pause_suppresses_orders_but_keeps_marking():
    bars = _ist_bars(60)
    signals = [0] * 60
    for i in range(35, 45):
        signals[i] = 1
    base = _input(bars, signals, start_i=30)
    paused_from = base.session_opens[34]
    resumed_at = base.session_opens[50]
    history = [{"status": "active", "at": base.started_at.isoformat()}, {"status": "paused", "at": paused_from.isoformat()}, {"status": "active", "at": resumed_at.isoformat()}]
    paused = replay(_input(bars, signals, start_i=30, history=history))
    assert paused["fills"] == []  # the whole long window fell inside the pause
    assert len(paused["equity"]) == len(replay(base)["equity"])


def test_paused_with_open_position_holds_and_marks():
    bars = _ist_bars(60)
    signals = [1] * 40 + [0] * 20
    base = _input(bars, signals, start_i=30)
    history = [{"status": "active", "at": base.started_at.isoformat()}, {"status": "paused", "at": base.session_opens[35].isoformat()}]
    result = replay(_input(bars, signals, start_i=30, history=history))
    assert [fill["side"] for fill in result["fills"]] == ["buy"]  # the flat signal at 40 is ignored while paused
    assert result["shares"] > 0
    assert result["equity"][-1] != result["equity"][-2]  # still marked to market


def test_fx_conversion_sizes_in_inr():
    bars = _ist_bars(40)
    signals = [1] * 40
    data = _input(bars, signals, start_i=20, fx=[80.0] * 40, capital=1_000_000.0)
    result = replay(data)
    price = bars["open"].iloc[20]
    assert result["shares"] == int(1_000_000.0 // (price * 80.0))
    assert abs(result["fills"][0]["notional"] - result["shares"] * price * 80.0) < 1e-6


def test_evaluation_end_freezes_the_window():
    bars = _ist_bars(60)
    signals = [1] * 60
    base = _input(bars, signals, start_i=30)
    stopped = replay(_input(bars, signals, start_i=30, end=base.session_opens[40]))
    assert stopped["eligible"][-1] == 40


def test_replay_is_deterministic():
    bars = _ist_bars(120)
    signals = [1 if (i // 9) % 2 else 0 for i in range(120)]
    first = replay(_input(bars, signals, start_i=40, cost=5, slip=5))
    second = replay(_input(bars, signals, start_i=40, cost=5, slip=5))
    assert first == second


# --- evaluated through the service with a stubbed market --------------------------------------


def _stub_market(n: int = 260, currency: str = "INR"):
    bars = _ist_bars(n)
    points = [{"timestamp": ts.isoformat(), "open": r.open, "high": r.high, "low": r.low, "close": r.close} for ts, r in bars.iterrows()]

    async def history(symbol, range_value="1y", interval="1d"):
        if symbol.upper().endswith("INR=X"):
            return {"symbol": symbol, "points": [p | {"open": 83.0, "close": 83.0} for p in points], "source": "live", "currency": "INR", "timezone": "UTC"}
        return {"symbol": symbol.upper(), "points": points, "source": "live", "currency": currency, "timezone": IST, "name": "Test Co", "exchange": "NSE"}

    async def quotes(symbols):
        return [{"symbol": s.upper(), "price": float(bars["close"].iloc[-1]), "source": "live", "updated": "2026-01-01T00:00:00+00:00"} for s in symbols]

    saved = (market.get_daily_history, market.get_chart, market.get_quotes)
    market.get_daily_history, market.get_chart, market.get_quotes = history, history, quotes

    def restore():
        market.get_daily_history, market.get_chart, market.get_quotes = saved

    return bars, restore


def _create(store, bars, days_before_end=80, symbol="TEST.NS", strategy="sma-crossover", params=None):
    record = asyncio.run(simulation_service.create_simulation_for_user(SimulationInput(symbol=symbol, strategy=strategy, params={"shortWindow": 5, "longWindow": 20} if params is None else params, startingCapital=500_000), "alice", store))
    started = bars.index[-days_before_end].to_pydatetime() - timedelta(hours=6)
    history = [{"status": "active", "at": started.isoformat()}]
    return asyncio.run(store.set_simulation_fields("alice", record["id"], {"startedAt": started.isoformat(), "statusHistory": history}))


def test_report_shows_positions_trades_and_comparisons():
    bars, restore = _stub_market()
    try:
        store = InMemoryStore()
        sim = _create(store, bars)
        at = bars.index[-1].to_pydatetime() + timedelta(days=1)
        report = asyncio.run(simulation_service.evaluate(sim, at))
        assert report["state"] == "ok"
        summary = report["summary"]
        assert summary["tradingDays"] >= 75
        assert summary["fills"] >= 1 and report["trades"]
        assert summary["buyHoldReturn"] is not None and summary["excessVsBuyHold"] is not None
        assert report["equity"] and report["buyHold"] and report["benchmark"]
        assert all(trade["date"] >= summary["firstSession"] for trade in report["trades"])
        assert report["metrics"]["sharpe"] is not None  # enough days for curve metrics
        again = asyncio.run(simulation_service.evaluate(sim, at))
        assert again == report
    finally:
        restore()


def test_new_simulation_is_too_early_for_curve_metrics():
    bars, restore = _stub_market()
    try:
        store = InMemoryStore()
        sim = _create(store, bars, days_before_end=5)
        report = asyncio.run(simulation_service.evaluate(sim, bars.index[-1].to_pydatetime() + timedelta(days=1)))
        assert report["state"] == "ok"
        assert report["metrics"]["sharpe"] is None
        assert "Too early" in report["metricReasons"]["sharpe"]
    finally:
        restore()


def test_usd_instrument_is_valued_through_fx():
    bars, restore = _stub_market(currency="USD")
    try:
        store = InMemoryStore()
        sim = _create(store, bars, symbol="TESTUSD", strategy="buy-and-hold", params={})
        report = asyncio.run(simulation_service.evaluate(sim, bars.index[-1].to_pydatetime() + timedelta(days=1)))
        assert report["fx"]["pair"] == "USDINR=X" and report["fx"]["rate"] == 83.0
        assert report["position"]["marketValue"] > 400_000  # ~INR 500k deployed, not ~6k
    finally:
        restore()


def test_legacy_free_text_strategy_needs_setup_and_can_be_set_up():
    bars, restore = _stub_market()
    try:
        store = InMemoryStore()
        legacy = asyncio.run(store.add_simulation("alice", SimulationInput.model_construct(symbol="TEST.NS", strategy="my secret sauce", startingCapital=10_000, notes=None, params={}, costBps=5, slippageBps=5, benchmark=None)))
        report = asyncio.run(simulation_service.report_for_user("alice", legacy["id"], store))
        assert report["state"] == "needs_setup"
        updated = asyncio.run(simulation_service.update_simulation_for_user("alice", legacy["id"], SimulationUpdate(strategy="momentum"), store))
        assert updated["tracking"] == "tracked" and updated["strategy"] == "momentum"
        # A tracked simulation's strategy is frozen.
        try:
            asyncio.run(simulation_service.update_simulation_for_user("alice", legacy["id"], SimulationUpdate(strategy="sma-crossover"), store))
            raise AssertionError("strategy change should be refused")
        except simulation_service.ActionError as exc:
            assert exc.status == 409
    finally:
        restore()


def test_legacy_record_with_known_strategy_name_is_replayed():
    bars, restore = _stub_market()
    try:
        store = InMemoryStore()
        legacy = asyncio.run(store.add_simulation("alice", SimulationInput.model_construct(symbol="TEST.NS", strategy="Simple moving average crossover", startingCapital=10_000, notes=None, params={}, costBps=5, slippageBps=5, benchmark=None)))
        report = asyncio.run(simulation_service.evaluate(legacy))
        assert report["strategy"]["id"] == "sma-crossover" and report["legacy"] is True
    finally:
        restore()


def test_completing_freezes_the_report():
    bars, restore = _stub_market()
    try:
        store = InMemoryStore()
        sim = _create(store, bars)
        done = asyncio.run(simulation_service.update_simulation_for_user("alice", sim["id"], SimulationUpdate(status="completed"), store))
        assert done["status"] == "completed" and "finalReport" not in done
        stored = asyncio.run(store.get_simulation("alice", sim["id"]))
        assert stored["finalReport"]["state"] == "ok"
        report = asyncio.run(simulation_service.report_for_user("alice", sim["id"], store))
        assert report["summary"] == stored["finalReport"]["summary"]
        try:
            asyncio.run(simulation_service.update_simulation_for_user("alice", sim["id"], SimulationUpdate(status="active"), store))
            raise AssertionError("completed -> active should be refused")
        except simulation_service.ActionError as exc:
            assert exc.status == 409
    finally:
        restore()


def test_simulation_api_contract():
    bars, restore = _stub_market()
    try:
        rate_limiter.reset()
        client = TestClient(app)
        email = f"sim-{uuid.uuid4().hex[:8]}@example.com"
        token = client.post("/api/auth/signup", json={"email": email, "password": "Tr1cky-Horse-42", "name": "Sim"}).json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        assert client.post("/api/simulations", headers=headers, json={"symbol": "TEST.NS", "strategy": "nope", "startingCapital": 1000}).status_code == 422
        bad_params = client.post("/api/simulations", headers=headers, json={"symbol": "TEST.NS", "strategy": "sma-crossover", "params": {"shortWindow": -3}, "startingCapital": 1000})
        assert bad_params.status_code == 422
        created = client.post("/api/simulations", headers=headers, json={"symbol": "TEST.NS", "strategy": "momentum", "startingCapital": 100000})
        assert created.status_code == 200, created.text
        sim = created.json()
        assert sim["tracking"] == "tracked" and sim["params"] and sim["startedAt"]
        report = client.get(f"/api/simulations/{sim['id']}/report", headers=headers)
        assert report.status_code == 200 and report.json()["state"] in {"ok", "waiting"}
        summaries = client.get("/api/simulations/summaries", headers=headers).json()
        assert sim["id"] in summaries
        assert client.get(f"/api/simulations/{sim['id']}", headers=headers).json()["id"] == sim["id"]
        assert client.patch(f"/api/simulations/{sim['id']}", headers=headers, json={"status": "paused"}).json()["status"] == "paused"
        assert client.patch(f"/api/simulations/{sim['id']}", headers=headers, json={"strategy": "sma-crossover"}).status_code == 409
        assert client.get("/api/simulations/missing/report", headers=headers).status_code == 404
    finally:
        restore()
