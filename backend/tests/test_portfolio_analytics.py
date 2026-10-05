"""Phase 10c: portfolio maths on hand-computed fixtures, the report endpoints, and no-advice wording."""

import asyncio
import re
import uuid
from datetime import date

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from backend import deps
from backend.analytics import portfolio as pa
from backend.analytics.metrics import value_at_risk
from backend.main import app
from backend.services import market_data_service as market
from backend.services import rate_limiter
from backend.tests.helpers import make_bars

BANNED = re.compile(r"\b(should|sell|buy|rebalance|reduce|increase|hold(ing)? on|trim|exit|recommend|consider|target allocation)\b", re.IGNORECASE)


def test_concentration_matches_hand_computation():
    result = pa.concentration(pd.Series({"A": 0.5, "B": 0.3, "C": 0.2}))
    assert result["top1"] == 0.5 and abs(result["top5"] - 1.0) < 1e-12
    assert abs(result["hhi"] - 0.38) < 1e-12
    assert abs(result["effectiveHoldings"] - 1 / 0.38) < 1e-12


def test_historical_var_and_cvar():
    returns = pd.Series(np.linspace(-0.05, 0.05, 101))
    var, _ = value_at_risk(returns, 0.95)["var"]
    cvar, _ = value_at_risk(returns, 0.95)["cvar"]
    assert abs(var - 0.045) < 1e-9
    assert abs(cvar - np.mean([-0.05, -0.049, -0.048, -0.047, -0.046, -0.045]) * -1) < 1e-9
    assert value_at_risk(returns.iloc[:5], 0.95)["var"][0] is None


def test_xirr_on_known_cash_flows():
    value, reason = pa.xirr([(date(2024, 1, 1), -1000.0), (date(2025, 1, 1), 1100.0)])
    assert reason is None
    assert abs(value - (1.1 ** (365 / 366) - 1)) < 1e-5
    assert pa.xirr([(date(2024, 1, 1), 1000.0)])[0] is None


def test_cap_redistributes_pro_rata_and_remove_renormalises():
    weights = pd.Series({"A": 0.6, "B": 0.3, "C": 0.1})
    capped = pa.apply_what_if(weights, cap=("A", 0.4))
    assert abs(capped["A"] - 0.4) < 1e-12 and abs(capped["B"] - 0.45) < 1e-12 and abs(capped["C"] - 0.15) < 1e-12
    removed = pa.apply_what_if(weights, remove=["A"])
    assert abs(removed["B"] - 0.75) < 1e-12 and "A" not in removed


def test_market_and_sector_stress():
    weights = pd.Series({"A": 0.5, "B": 0.5})
    market_shock = pa.stress_loss(weights, shock=-0.1, kind="market", betas={"A": 1.2, "B": None})
    assert abs(market_shock["change"] - (-0.11)) < 1e-12 and market_shock["assumedBetaOne"] == ["B"]
    sector_shock = pa.stress_loss(weights, shock=-0.2, kind="sector", sectors=pd.Series({"A": "Banks", "B": "IT"}), sector="Banks")
    assert abs(sector_shock["change"] - (-0.1)) < 1e-12


def test_weighted_returns_use_current_weights():
    index = pd.DatetimeIndex(["2026-01-01", "2026-01-02", "2026-01-05"])
    prices = pd.DataFrame({"A": [100, 110, 110], "B": [50, 50, 45]}, index=index)
    returns = pa.weighted_returns(prices, pd.Series({"A": 0.25, "B": 0.75}))
    assert abs(returns.iloc[0] - 0.025) < 1e-12 and abs(returns.iloc[1] - (-0.075)) < 1e-12


def test_thin_history_is_excluded_with_a_reason():
    index = pd.date_range("2026-01-01", periods=100, freq="B")
    full = pd.Series(np.linspace(100, 120, 100), index=index)
    thin = full.iloc[-10:]
    aligned, excluded = pa.align_prices({"FULL": full, "THIN": thin, "NONE": None}, 365)
    assert list(aligned.columns) == ["FULL"]
    assert {item["key"] for item in excluded} == {"THIN", "NONE"}


# --- through the API with stubbed market data ------------------------------------------------


def _stub():
    series = {"RELIANCE.NS": make_bars(300, seed=1), "TCS.NS": make_bars(300, seed=2), "^NSEI": make_bars(300, seed=3)}

    def payload(symbol):
        bars = series.get(symbol.upper(), series["^NSEI"])
        points = [{"timestamp": ts.isoformat(), "open": r.open, "high": r.high, "low": r.low, "close": r.close} for ts, r in bars.iterrows()]
        return {"symbol": symbol, "points": points, "source": "live", "currency": "INR", "timezone": "Asia/Kolkata"}

    async def history(symbol, range_value="1y", interval="1d"):
        return payload(symbol)

    async def quotes(symbols):
        return [{"symbol": s.upper(), "price": float(series.get(s.upper(), series["^NSEI"])["close"].iloc[-1]), "currency": "INR", "source": "live", "updated": "2026-10-05T00:00:00+00:00"} for s in symbols]

    saved = (market.get_daily_history, market.get_quotes)
    market.get_daily_history, market.get_quotes = history, quotes

    def restore():
        market.get_daily_history, market.get_quotes = saved

    return restore


def _signup(client):
    email = f"rep-{uuid.uuid4().hex[:8]}@example.com"
    return {"Authorization": f"Bearer {client.post('/api/auth/signup', json={'email': email, 'password': 'Tr1cky-Horse-42', 'name': 'R'}).json()['token']}"}


def test_report_whatif_and_unsaved_preview():
    restore = _stub()
    try:
        rate_limiter.reset()
        client = TestClient(app)
        headers = _signup(client)
        assert client.get("/api/portfolio/report", headers=headers).status_code == 404
        rows = [
            {"symbol": "RELIANCE.NS", "quantity": 30, "avgCost": 80, "buyDate": "2025-01-10"},
            {"symbol": "RELIANCE.NS", "quantity": 10, "avgCost": 90, "buyDate": "2025-06-10"},
            {"symbol": "TCS.NS", "quantity": 10},
        ]
        assert client.post("/api/portfolio/imports", headers=headers, json={"rows": rows}).status_code == 200
        report = client.get("/api/portfolio/report", headers=headers).json()
        assert report["totals"]["positions"] == 2 and report["totals"]["lots"] == 3
        assert abs(sum(p["weight"] for p in report["positions"]) - 1) < 1e-9
        assert report["positions"][0]["quantity"] in (40, 10)
        for key in ("volatility", "var", "cvar", "beta", "maxDrawdown", "trackingError"):
            assert report["risk"][key] is not None, key
        assert report["xirr"]["positionsCovered"] == 1
        assert report["correlation"]["keys"] and report["equity"] and report["disclaimer"]
        assert report["observations"]
        for sentence in report["observations"]:
            assert not BANNED.search(sentence), sentence

        biggest = report["positions"][0]["key"]
        scenario = client.post("/api/portfolio/what-if", headers=headers, json={"cap": {"key": biggest, "maxWeight": 0.3}, "shock": {"kind": "market", "pct": -0.1}}).json()
        assert abs(scenario["after"]["concentration"]["top1"] - max(0.3, 1 - 0.3)) < 1e-6 or scenario["after"]["concentration"]["top1"] <= report["concentration"]["top1"]
        assert scenario["after"]["risk"]["volatility"] is not None
        assert scenario["shock"]["before"]["change"] < 0

        store = asyncio.run(deps.get_store())
        before = len(store.holdings)
        preview = client.post("/api/portfolio/report/preview", headers=headers, json={"rows": [{"symbol": "TCS.NS", "quantity": 1}]})
        assert preview.status_code == 200 and preview.json()["totals"]["positions"] == 1
        assert len(store.holdings) == before  # analyze-without-saving stores nothing
        refused = client.post("/api/portfolio/report/preview", headers=headers, json={"rows": [{"symbol": "ABCPE1234F", "quantity": 1}]})
        assert refused.status_code == 422 and "ABCPE1234F" not in refused.text
    finally:
        restore()
