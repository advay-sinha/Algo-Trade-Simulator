"""Phase 10a acceptance: personal data never reaches the store, logs, or response bodies."""

import json
import logging
import uuid

from fastapi.testclient import TestClient

from backend import deps
from backend.main import app
from backend.services import amfi
from backend.services import market_data_service as market
from backend.services import rate_limiter

SEEDED = {
    "pan": "ABCPE1234F",
    "aadhaar": "234567890124",
    "demat_id": "1208160012345678",
    "phone": "9876543210",
    "email": "investor.one@example.com",
}


def _client():
    rate_limiter.reset()
    return TestClient(app)


def _signup(client):
    email = f"pf-{uuid.uuid4().hex[:10]}@example.com"
    token = client.post("/api/auth/signup", json={"email": email, "password": "Tr1cky-Horse-42", "name": "Pf"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def _stub_market(live=("RELIANCE.NS", "TCS.NS", "ZZNEW")):
    async def quotes(symbols):
        return [
            {"symbol": s.upper(), "price": 100.0, "currency": "INR", "source": "live" if s.upper() in live else "offline"}
            for s in symbols
        ]

    saved = market.get_quotes
    market.get_quotes = quotes

    def restore():
        market.get_quotes = saved

    return restore


def _holdings_count():
    import asyncio

    store = asyncio.run(deps.get_store())
    return len(store.holdings), len(store.portfolio_imports)


def test_clean_import_resolves_and_saves_holding_fields_only():
    restore = _stub_market()
    try:
        client = _client()
        headers = _signup(client)
        body = {
            "source": "csv",
            "rows": [
                {"symbol": "RELIANCE.NS", "quantity": 10, "avgCost": 2450.5, "buyDate": "2024-03-15"},
                {"isin": "INE467B01029", "quantity": 5},
            ],
        }
        response = client.post("/api/portfolio/imports", headers=headers, json=body)
        assert response.status_code == 200, response.text
        data = response.json()
        names = [h["name"] for h in data["holdings"]]
        assert names == ["Reliance Industries Limited", "Tata Consultancy Services Limited"]
        assert data["holdings"][1]["symbol"] == "TCS.NS" and data["holdings"][0]["sector"]
        listed = client.get("/api/portfolio", headers=headers).json()
        assert len(listed["holdings"]) == 2 and listed["imports"][0]["rowCount"] == 2
        allowed = {"id", "importId", "symbol", "isin", "schemeCode", "name", "exchange", "currency", "type", "sector", "assetType", "quantity", "avgCost", "buyDate", "createdAt"}
        assert set(listed["holdings"][0]) <= allowed
    finally:
        restore()


def test_seeded_personal_data_is_rejected_whole_and_never_echoed_or_logged(caplog):
    restore = _stub_market()
    try:
        client = _client()
        headers = _signup(client)
        before = _holdings_count()
        caplog.set_level(logging.DEBUG)
        for kind, value in SEEDED.items():
            body = {"rows": [{"symbol": "RELIANCE.NS", "quantity": 1}, {"symbol": value, "quantity": 2}]}
            response = client.post("/api/portfolio/imports", headers=headers, json=body)
            assert response.status_code == 422, (kind, response.text)
            detail = response.json()["detail"]
            assert detail["code"] == "personal_data_detected"
            assert detail["findings"][0] == {"field": "symbol", "kind": kind, "label": detail["findings"][0]["label"], "row": 2}
            assert value not in response.text
            assert "Row 2, Symbol looks like" in detail["message"]
        assert _holdings_count() == before  # nothing saved, not even the clean first row
        logged = "\n".join(record.getMessage() for record in caplog.records)
        for value in SEEDED.values():
            assert value not in logged
    finally:
        restore()


def test_personal_data_in_numeric_or_unknown_fields_is_caught_without_echo():
    client = _client()
    headers = _signup(client)
    in_number = client.post("/api/portfolio/imports", headers=headers, json={"rows": [{"symbol": "TCS.NS", "quantity": "ABCPE1234F"}]})
    assert in_number.status_code == 422 and in_number.json()["detail"]["findings"][0]["field"] == "quantity"
    extra = client.post("/api/portfolio/imports", headers=headers, json={"rows": [{"symbol": "TCS.NS", "quantity": 1, "ABCPE1234F": "investor@okicici"}]})
    assert extra.status_code == 422
    assert "ABCPE1234F" not in extra.text and "investor@okicici" not in extra.text
    assert {f["field"] for f in extra.json()["detail"]["findings"]} == {"other"}


def test_invalid_rows_return_field_paths_only():
    client = _client()
    headers = _signup(client)
    body = {"rows": [{"isin": "INE002A01019", "quantity": 1}, {"symbol": "TCS.NS", "quantity": -5}, {"symbol": "TCS.NS", "quantity": 1, "buyDate": "2999-01-01"}, {"symbol": "TCS.NS", "quantity": 1, "assetType": "crypto-ish"}, {"symbol": "TCS.NS", "quantity": 1, "nickname": "my stock"}]}
    response = client.post("/api/portfolio/imports", headers=headers, json=body)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "invalid_rows"
    rows = {problem["row"] for problem in detail["problems"]}
    assert rows == {1, 2, 3, 4, 5}
    for echoed in ("INE002A01019", "2999-01-01", "crypto-ish", "my stock", "nickname"):
        assert echoed not in response.text
    too_many = client.post("/api/portfolio/imports", headers=headers, json={"rows": [{"symbol": "TCS.NS", "quantity": 1}] * 101})
    assert too_many.status_code == 422


def test_unresolved_instruments_are_returned_not_stored():
    restore = _stub_market(live=())
    try:
        client = _client()
        headers = _signup(client)
        before = _holdings_count()
        response = client.post("/api/portfolio/imports", headers=headers, json={"rows": [{"symbol": "RELIANCE.NS", "quantity": 1}, {"symbol": "NOTREAL1", "quantity": 1}]})
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == "unresolved_instruments" and detail["rows"] == [{"row": 2, "field": "symbol"}]
        assert "NOTREAL1" not in response.text
        assert _holdings_count() == before
    finally:
        restore()


def test_mutual_fund_isin_resolves_through_amfi():
    saved = amfi.scheme_by_isin
    amfi.scheme_by_isin = lambda isin: {"schemeCode": "135762", "name": "Axis Children's Fund - Direct Plan - Growth Option", "nav": 29.0, "navDate": "01-Oct-2026", "category": "Children's Fund"} if isin == "INF846K01WO1" else None
    try:
        client = _client()
        headers = _signup(client)
        response = client.post("/api/portfolio/imports", headers=headers, json={"source": "cams", "rows": [{"isin": "INF846K01WO1", "quantity": 120.5, "avgCost": 20}]})
        assert response.status_code == 200, response.text
        holding = response.json()["holdings"][0]
        assert holding["assetType"] == "mutual_fund" and holding["schemeCode"] == "135762" and holding["symbol"] is None
    finally:
        amfi.scheme_by_isin = saved


def test_delete_one_import_and_everything_is_hard_and_user_scoped():
    restore = _stub_market()
    try:
        client = _client()
        alice = _signup(client)
        bob = _signup(client)
        first = client.post("/api/portfolio/imports", headers=alice, json={"rows": [{"symbol": "RELIANCE.NS", "quantity": 1}]}).json()
        client.post("/api/portfolio/imports", headers=alice, json={"rows": [{"symbol": "TCS.NS", "quantity": 2}]})
        assert client.delete(f"/api/portfolio/imports/{first['import']['id']}", headers=bob).status_code == 404
        assert client.delete(f"/api/portfolio/imports/{first['import']['id']}", headers=alice).status_code == 204
        remaining = client.get("/api/portfolio", headers=alice).json()
        assert [h["symbol"] for h in remaining["holdings"]] == ["TCS.NS"] and len(remaining["imports"]) == 1
        assert client.delete("/api/portfolio", headers=alice).status_code == 204
        assert client.get("/api/portfolio", headers=alice).json() == {"imports": [], "holdings": []}
    finally:
        restore()


def test_validation_errors_never_echo_input_anywhere():
    client = _client()
    response = client.post("/api/auth/signup", json={"email": "x@example.com", "password": "short1", "name": "X"})
    assert response.status_code == 422
    assert "short1" not in response.text
    assert all(set(item) == {"loc", "type", "msg"} for item in response.json()["detail"])
    assert json.loads(response.text)["detail"][0]["loc"][-1] == "password"
