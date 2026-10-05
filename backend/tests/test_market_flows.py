"""Phase 11: flow/positioning/sector/capex parsers on synthetic copies of each format, the
protected refresh route, idempotent snapshots, and the copilot tools (no network)."""

import asyncio
import uuid

import pandas as pd
from fastapi.testclient import TestClient

from backend import deps
from backend.config import settings
from backend.main import app
from backend.services import flows_service
from backend.services import market_flows as mf
from backend.services import rate_limiter
from backend.tests.test_copilot import ScriptedLLM, new_store, run, tool_call
from langchain_core.messages import AIMessage

FII_DII = [
    {"buyValue": "25,420.04", "category": "DII", "date": "01-Oct-2026", "netValue": "10041.84", "sellValue": "15378.2"},
    {"buyValue": "12260.26", "category": "FII/FPI", "date": "01-Oct-2026", "netValue": "-9484.22", "sellValue": "21744.48"},
]
OI_CSV = (
    '"Participant wise Open Interest (no. of contracts) in Equity Derivatives as on Oct 01, 2026",,,,\n'
    "Client Type,Future Index Long,Future Index Short,Future Stock Long,Future Stock Short       ,Total Long Contracts      ,Total Short Contracts\n"
    "Client,306566,56754,3422680,155072,11974455,8625995\n"
    "DII,48119,14862,264333,4574585,414299,4820933\n"
    "FII,29605,339779,3393649,2858568,5548830,5046031\n"
    "Pro,51101,23996,817937,310374,4666020,4110645\n"
    "TOTAL,435391,435391,7898599,7898599,0,0\n"
)


def _row(cells):
    return "<tr>" + "".join(f"<td>{cell}</td>" for cell in cells) + "</tr>"


def _sector_html():
    periods = ["AUC as on August 31, 2026", "Net Investment August 16-31, 2026", "Net Investment September 01-15, 2026", "AUC as on September 15, 2026"]
    sub = ["Equity", "Debt", "Total"]
    head0 = _row(["", ""] + periods)
    head1 = _row(["", ""] + ["IN INR Cr.", "IN USD Mn"] * 4)
    head2 = _row(["", ""] + ["Equity", "Debt"] * 4)
    header = _row(["Sr. No.", "Sectors"] + sub * 8)

    def sector(number, name, net, auc):
        values = []
        for period in range(4):
            for currency in range(2):
                if period == 2 and currency == 0:
                    values += [f"{net:,}", "5", f"{net + 5:,}"]
                elif period == 3 and currency == 0:
                    values += [f"{auc:,}", "0", f"{auc:,}"]
                else:
                    values += ["1", "0", "1"]
        return _row([number, name] + values)

    body = sector("1", "Financial Services", -6204, 2027312) + sector("2", "Information Technology", 960, 380567) + sector("", "Grand Total", -5244, 2407879)
    return f"<table>{head0}{head1}{head2}{header}{body}</table>"


def test_fii_dii_parser():
    parsed = mf.parse_fii_dii(FII_DII)
    assert parsed == {"date": "2026-10-01", "fii": {"buy": 12260.26, "sell": 21744.48, "net": -9484.22}, "dii": {"buy": 25420.04, "sell": 15378.2, "net": 10041.84}}
    assert mf.parse_fii_dii({"unexpected": True}) is None
    assert mf.parse_fii_dii([{"category": "DII"}]) is None


def test_participant_oi_parser():
    parsed = mf.parse_participant_oi(OI_CSV)
    assert parsed["date"] == "2026-10-01"
    assert parsed["participants"]["fii"]["futIndexShort"] == 339779
    assert abs(parsed["fiiIndexFuturesLongShare"] - 29605 / (29605 + 339779)) < 1e-12
    assert mf.parse_participant_oi("garbage") is None


def test_sector_report_parser_and_names():
    parsed = mf.parse_sector_report(_sector_html())
    assert parsed["period"] == "Net Investment September 01-15, 2026"
    by_name = {item["sector"]: item for item in parsed["sectors"]}
    assert by_name["Financial Services"]["netEquity"] == -6204 and by_name["Financial Services"]["aucEquity"] == 2027312
    assert by_name["Information Technology"]["netTotal"] == 965
    assert parsed["total"]["netEquity"] == -5244
    assert abs(sum(item["aucShare"] for item in parsed["sectors"]) - 1) < 1e-9
    assert mf.parse_sector_report("<table><tr><td>nope</td></tr></table>") is None
    assert mf.report_names('x FIIInvestSector_Sep152026.html y FIIInvestSector_June302026.html FIIInvestSector_Sep152026.html') == ["FIIInvestSector_Sep152026.html", "FIIInvestSector_June302026.html"]
    assert mf.report_date("FIIInvestSector_June302026.html") == "2026-06-30" and mf.report_date("FIIInvestSector_Sep152026.html") == "2026-09-15"


def test_capex_aggregation_only_compares_like_with_like():
    companies = [
        {"sector": "Energy", "data": {"years": [{"fiscalYearEnd": "2026-03-31", "capex": 120.0, "revenue": 1000.0}, {"fiscalYearEnd": "2025-03-31", "capex": 100.0, "revenue": 900.0}]}},
        {"sector": "Energy", "data": {"years": [{"fiscalYearEnd": "2026-03-31", "capex": 30.0, "revenue": 300.0}]}},
        {"sector": "IT", "data": {"years": [{"fiscalYearEnd": "2026-03-31", "capex": 10.0, "revenue": 500.0}, {"fiscalYearEnd": "2025-03-31", "capex": 8.0, "revenue": 450.0}]}},
    ]
    result = mf.aggregate_sector_capex(companies)
    energy = next(item for item in result["sectors"] if item["sector"] == "Energy")
    assert energy["companies"] == 2 and energy["years"][0]["capex"] == 150.0
    assert energy["years"][0]["capexGrowth"] is None  # 2 companies reported FY26, 1 reported FY25
    it = next(item for item in result["sectors"] if item["sector"] == "IT")
    assert abs(it["years"][0]["capexGrowth"] - 0.25) < 1e-12 and abs(it["years"][0]["capexToRevenue"] - 0.02) < 1e-12


def test_company_capex_from_a_stub_statement(monkeypatch=None):
    import yfinance as yf

    columns = [pd.Timestamp("2026-03-31"), pd.Timestamp("2025-03-31")]

    class FakeTicker:
        def __init__(self, symbol):
            self.cashflow = pd.DataFrame({columns[0]: [-120.0, 300.0], columns[1]: [-100.0, 250.0]}, index=["Capital Expenditure", "Operating Cash Flow"])
            self.financials = pd.DataFrame({columns[0]: [1000.0], columns[1]: [900.0]}, index=["Total Revenue"])
            self.fast_info = {"currency": "INR"}

    saved = yf.Ticker
    yf.Ticker = FakeTicker
    try:
        result = mf.fetch_company_capex("TEST.NS")
    finally:
        yf.Ticker = saved
    years = result["data"]["years"]
    assert result["source"] == "live" and result["asOf"] == "2026-03-31"
    assert years[0]["capex"] == 120.0 and abs(years[0]["capexGrowth"] - 0.2) < 1e-12
    assert abs(years[0]["capexToOperatingCashFlow"] - 0.4) < 1e-12 and abs(years[0]["capexToRevenue"] - 0.12) < 1e-12


def _stub_fetchers():
    saved = (mf.fetch_fii_dii_cash, mf.fetch_participant_oi, mf.fetch_sector_flows, mf.list_sector_reports)
    mf.fetch_fii_dii_cash = lambda: {"source": "live", "asOf": "2026-10-01", "data": mf.parse_fii_dii(FII_DII)}
    mf.fetch_participant_oi = lambda day: {"source": "live", "asOf": day.isoformat(), "data": mf.parse_participant_oi(OI_CSV) | {"date": day.isoformat()}}
    mf.fetch_sector_flows = lambda name=None: {"source": "live", "asOf": "2026-09-15", "data": mf.parse_sector_report(_sector_html()) | {"report": "x"}}
    mf.list_sector_reports = lambda limit=12: ["FIIInvestSector_Sep152026.html"]
    flows_service._last_attempt.clear()

    def restore():
        mf.fetch_fii_dii_cash, mf.fetch_participant_oi, mf.fetch_sector_flows, mf.list_sector_reports = saved

    return restore


def test_refresh_route_is_secret_protected_and_idempotent():
    restore = _stub_fetchers()
    saved_secret = settings.cron_secret
    try:
        rate_limiter.reset()
        client = TestClient(app)
        settings.cron_secret = None
        assert client.get("/api/internal/flows/refresh").status_code == 404
        settings.cron_secret = "s3cret-test-value"
        assert client.get("/api/internal/flows/refresh").status_code == 401
        assert client.get("/api/internal/flows/refresh", headers={"Authorization": "Bearer wrong"}).status_code == 401
        ok = client.get("/api/internal/flows/refresh?backfillDays=3", headers={"Authorization": "Bearer s3cret-test-value"})
        assert ok.status_code == 200 and ok.json()["cash"] == 1 and ok.json()["positioning"] == 3
        assert set(ok.json()) == {"cash", "positioning", "sectorReports", "sectorCapex", "unavailable"}
        client.get("/api/internal/flows/refresh?backfillDays=3", headers={"Authorization": "Bearer s3cret-test-value"})
        store = asyncio.run(deps.get_store())
        assert len(asyncio.run(store.list_flow_snapshots(flows_service.KIND_CASH))) == 1
        assert len(asyncio.run(store.list_flow_snapshots(flows_service.KIND_OI))) == 3
    finally:
        settings.cron_secret = saved_secret
        restore()


def test_read_routes_and_copilot_tools():
    restore = _stub_fetchers()
    try:
        rate_limiter.reset()
        client = TestClient(app)
        token = client.post("/api/auth/signup", json={"email": f"fl-{uuid.uuid4().hex[:8]}@example.com", "password": "Tr1cky-Horse-42", "name": "F"}).json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/api/market/flows/institutional").status_code == 401
        flows = client.get("/api/market/flows/institutional", headers=headers).json()
        assert flows["cash"][-1]["fii"]["net"] == -9484.22 and flows["asOf"]["cash"] == "2026-10-01"
        assert flows["positioning"] and flows["unit"]["cash"] == "INR crore"
        assert client.get("/api/fundamentals/capex?symbols=" + ",".join(["TCS.NS"] * 11), headers=headers).status_code == 422

        store = new_store()
        flows_service._last_attempt.clear()  # the capture throttle is per process; this is a fresh store
        llm = ScriptedLLM([tool_call("get_institutional_flows", {"days": 5}, "f1"), AIMessage(content="FIIs sold.")])
        events = run("alice", store, "What are FIIs and DIIs doing?", llm)
        result = next(e for e in events if e["type"] == "tool_end")["result"]
        assert result["cashTotals"]["fiiNet"] == -9484.22 and result["asOf"]["cash"] == "2026-10-01"
    finally:
        restore()
