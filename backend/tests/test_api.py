"""HTTP contract tests through the real app (in-memory store, stubbed market data, no network)."""

import uuid

from fastapi.testclient import TestClient

from backend.main import app
from backend.services import market_data_service as market
from backend.services import rate_limiter
from backend.tests.helpers import make_bars


def _client():
    rate_limiter.reset()
    return TestClient(app)


def _signup(client, password="Tr1cky-Horse-42"):
    email = f"api-{uuid.uuid4().hex[:10]}@example.com"
    response = client.post("/api/auth/signup", json={"email": email, "password": password, "name": "Api"})
    assert response.status_code == 200, response.text
    return email, {"Authorization": f"Bearer {response.json()['token']}"}


def _stub_market():
    bars = make_bars(600)
    points = [{"timestamp": ts.isoformat(), "open": r.open, "high": r.high, "low": r.low, "close": r.close, "volume": r.volume} for ts, r in bars.iterrows()]

    async def history(symbol, range_value="1y", interval="1d"):
        return {"symbol": symbol.upper(), "points": points, "source": "live", "currency": "USD", "range": range_value, "interval": interval}

    async def quotes(symbols):
        return [{"symbol": s, "price": 100.0, "change": 1.0, "changePercent": 1.0, "previousClose": 99.0, "currency": "USD", "updated": "2026-01-01T00:00:00+00:00", "source": "live"} for s in symbols]

    saved = (market.get_daily_history, market.get_chart, market.get_quotes)
    market.get_daily_history, market.get_chart, market.get_quotes = history, history, quotes
    return lambda: setattr_many(saved)


def setattr_many(saved):
    market.get_daily_history, market.get_chart, market.get_quotes = saved


def test_health_and_docs():
    client = _client()
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/api/docs").status_code == 200


def test_auth_flow_signup_login_logout():
    client = _client()
    email, headers = _signup(client)
    assert client.get("/api/simulations", headers=headers).status_code == 200
    login = client.post("/api/auth/login", json={"email": email, "password": "Tr1cky-Horse-42"})
    assert login.status_code == 200
    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/simulations", headers=headers).status_code == 401
    assert client.get("/api/simulations", headers={"Authorization": "Bearer garbage"}).status_code == 401
    assert client.get("/api/simulations").status_code == 401


def test_password_policy_and_duplicate_email():
    client = _client()
    assert client.post("/api/auth/signup", json={"email": "x@example.com", "password": "short", "name": "X"}).status_code == 422
    assert client.post("/api/auth/signup", json={"email": "y@example.com", "password": "password123", "name": "Y"}).status_code == 422
    email, _ = _signup(client)
    duplicate = client.post("/api/auth/signup", json={"email": email, "password": "Tr1cky-Horse-42", "name": "Again"})
    assert duplicate.status_code == 409 and duplicate.json()["detail"] == "Email already registered"


def test_login_is_rate_limited():
    client = _client()
    codes = [client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "wrong-password"}).status_code for _ in range(8)]
    assert codes[:5] == [401] * 5 and 429 in codes
    limited = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "wrong-password"})
    assert limited.status_code == 429 and "retry-after" in {k.lower() for k in limited.headers}


def test_simulation_crud_ordering_and_validation():
    client = _client()
    _, headers = _signup(client)
    first = client.post("/api/simulations", headers=headers, json={"symbol": "AAPL", "strategy": "sma-crossover", "startingCapital": 1000}).json()
    second = client.post("/api/simulations", headers=headers, json={"symbol": "MSFT", "strategy": "momentum", "startingCapital": 2000}).json()
    listed = client.get("/api/simulations", headers=headers).json()
    assert [item["id"] for item in listed] == [second["id"], first["id"]]  # newest first in every store
    assert client.patch(f"/api/simulations/{first['id']}", headers=headers, json={"status": "hacked"}).status_code == 422
    assert client.patch(f"/api/simulations/{first['id']}", headers=headers, json={"status": "paused"}).json()["status"] == "paused"
    assert client.post("/api/simulations", headers=headers, json={"symbol": "../x", "strategy": "s", "startingCapital": 1}).status_code == 422
    assert client.delete(f"/api/simulations/{first['id']}", headers=headers).status_code == 204
    missing = client.delete(f"/api/simulations/{first['id']}", headers=headers)
    assert missing.status_code == 404 and missing.json()["detail"] == "Simulation not found"
    _, other = _signup(client)
    assert client.delete(f"/api/simulations/{second['id']}", headers=other).status_code == 404


def test_market_validation_never_reaches_provider():
    client = _client()
    _, headers = _signup(client)
    assert client.get("/api/market/watchlist", params={"symbols": "AAPL,../../etc"}, headers=headers).status_code == 422
    assert client.get("/api/market/chart/AAPL", params={"range": "evil"}, headers=headers).status_code == 422
    assert client.get("/api/market/watchlist").status_code == 401


def test_backtest_risk_and_trades_endpoints():
    client = _client()
    restore = _stub_market()
    try:
        _, headers = _signup(client)
        run = client.post("/api/backtest/run", headers=headers, json={"symbol": "AAPL", "strategy": "sma-crossover", "params": {"shortWindow": 20, "longWindow": 60}, "range": "2y"})
        assert run.status_code == 200, run.text
        backtest_id = run.json()["id"]
        detail = client.get(f"/api/backtest/{backtest_id}", headers=headers).json()
        assert "equity" in detail and "trades" not in detail
        risk = client.get(f"/api/backtest/{backtest_id}/risk", headers=headers).json()
        assert {"sharpe", "sortino", "maxDrawdown"} <= set(risk["metrics"])
        trades = client.get(f"/api/backtest/{backtest_id}/trades", headers=headers).json()
        assert isinstance(trades, list)
        listing = client.get("/api/backtests", headers=headers).json()
        assert listing[0]["id"] == backtest_id and "equity" not in listing[0]
        bad = client.post("/api/backtest/run", headers=headers, json={"symbol": "AAPL", "strategy": "sma-crossover", "params": {"shortWindow": 60, "longWindow": 20}})
        assert bad.status_code == 422 and "shortWindow" in bad.json()["detail"]
        _, other = _signup(client)
        assert client.get(f"/api/backtest/{backtest_id}", headers=other).status_code == 404
    finally:
        restore()


def test_ml_train_predict_and_registry_endpoints():
    client = _client()
    restore = _stub_market()
    try:
        _, headers = _signup(client)
        trained = client.post("/api/ml/train", headers=headers, json={"symbol": "AAPL", "range": "5y", "model": "logistic"})
        assert trained.status_code == 200, trained.text
        body = trained.json()
        assert "artifactId" not in body and body["tracking"] == {"enabled": False}
        signal = client.post("/api/ml/predict", headers=headers, json={"modelId": body["id"]}).json()
        assert signal["modelId"] == body["id"] and signal["signal"] in ("buy", "flat")
        assert [m["id"] for m in client.get("/api/ml/models", headers=headers).json()] == [body["id"]]
        preview = client.post("/api/ml/features", headers=headers, json={"symbol": "AAPL", "range": "2y"}).json()
        assert preview["shape"]["rows"] > 100 and preview["split"]["trainEnd"] < preview["split"]["testStart"]
    finally:
        restore()


def test_status_exposes_no_secrets():
    client = _client()
    _, headers = _signup(client)
    status = client.get("/api/status", headers=headers)
    assert status.status_code == 200
    text = status.text.lower()
    for secret_marker in ("mongodb://", "mongodb+srv", "password", "api_key", "token"):
        assert secret_marker not in text
    assert status.json()["store"] == "memory"


def test_dev_bypass_disabled_by_default():
    client = _client()
    assert client.post("/api/dev/auth/bypass", json={}).status_code == 403
