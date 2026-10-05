"""Market-intelligence reads and captures on top of services/market_flows.py.

History lives in the `market_flows` collection (public data, no user fields): one snapshot per
kind and date. A scheduled refresh (Vercel Cron → /api/internal/flows/refresh) captures the
latest day; reads also capture on demand when the stored copy is stale, at most once per
process per source every few minutes, so history still grows without the schedule.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from backend.services import market_flows as mf
from backend.services import market_data_service as market
from backend.services import symbol_catalog
from backend.services.clock import now

logger = logging.getLogger("algo_trade_backend.flows")

KIND_CASH = "fii_dii_cash"
KIND_OI = "participant_oi"
KIND_SECTOR = "fpi_sector"
KIND_SECTOR_CAPEX = "sector_capex"
LIVE_RETRY_SECONDS = 600
SECTOR_CAPEX_MAX_AGE_DAYS = 7
CAPEX_TTL_SECONDS = 24 * 60 * 60
SECTOR_INDICES = [
    ("^NSEBANK", "Nifty Bank"),
    ("^CNXIT", "Nifty IT"),
    ("^CNXPHARMA", "Nifty Pharma"),
    ("^CNXAUTO", "Nifty Auto"),
    ("^CNXFMCG", "Nifty FMCG"),
    ("^CNXMETAL", "Nifty Metal"),
    ("^CNXENERGY", "Nifty Energy"),
    ("^CNXREALTY", "Nifty Realty"),
    ("^CNXINFRA", "Nifty Infrastructure"),
    ("^CNXPSUBANK", "Nifty PSU Bank"),
]

_last_attempt: Dict[str, float] = {}
HEALTH: Dict[str, Dict[str, Any]] = {}


def _record(source: str, result: Dict[str, Any]) -> None:
    HEALTH[source] = {"status": "ok" if result.get("source") == "live" else "unavailable", "checkedAt": now().isoformat(), "asOf": result.get("asOf")}


def _may_try(key: str) -> bool:
    last = _last_attempt.get(key)
    if last is not None and time.monotonic() - last < LIVE_RETRY_SECONDS:
        return False
    _last_attempt[key] = time.monotonic()
    return True


async def _capture_cash(store: Any) -> Dict[str, Any]:
    result = await asyncio.to_thread(mf.fetch_fii_dii_cash)
    _record("nse_fii_dii", result)
    if result["source"] == "live":
        await store.upsert_flow_snapshot(KIND_CASH, result["asOf"], result["data"], "live")
    return result


async def _capture_oi(store: Any, day: date) -> Dict[str, Any]:
    result = await asyncio.to_thread(mf.fetch_participant_oi, day)
    _record("nse_participant_oi", result)
    if result["source"] == "live":
        await store.upsert_flow_snapshot(KIND_OI, result["asOf"], result["data"], "live")
    return result


async def _capture_sector(store: Any, name: Optional[str] = None) -> Dict[str, Any]:
    result = await asyncio.to_thread(mf.fetch_sector_flows, name)
    _record("nsdl_sector", result)
    if result["source"] == "live" and result.get("asOf"):
        await store.upsert_flow_snapshot(KIND_SECTOR, result["asOf"], result["data"], "live")
    return result


async def refresh(store: Any, backfill_days: int = 0, backfill_reports: int = 0, capex: bool = False) -> Dict[str, Any]:
    """Scheduled capture. Returns counts only."""
    counts = {"cash": 0, "positioning": 0, "sectorReports": 0, "sectorCapex": 0, "unavailable": []}
    cash = await _capture_cash(store)
    counts["cash"] += cash["source"] == "live"
    if cash["source"] != "live":
        counts["unavailable"].append("nse_fii_dii")
    for day in mf.recent_weekdays(max(1, min(backfill_days, 60))):
        oi = await _capture_oi(store, day)
        counts["positioning"] += oi["source"] == "live"
    if backfill_reports > 0:
        names = await asyncio.to_thread(mf.list_sector_reports, min(backfill_reports, 24))
        for name in names:
            counts["sectorReports"] += (await _capture_sector(store, name))["source"] == "live"
    else:
        counts["sectorReports"] += (await _capture_sector(store))["source"] == "live"
    if capex:
        counts["sectorCapex"] = 1 if (await sector_capex(store, force=True)).get("source") == "live" else 0
    return counts


def _cumulative(rows: List[Dict[str, Any]], key: str) -> None:
    running = 0.0
    for row in rows:
        net = (row.get(key) or {}).get("net")
        running += net or 0.0
        row[f"{key}Cumulative"] = running


async def institutional(store: Any, days: int = 30) -> Dict[str, Any]:
    cash = await store.list_flow_snapshots(KIND_CASH, limit=days)
    today = now().date().isoformat()
    if (not cash or cash[0]["date"] < (now().date() - timedelta(days=1)).isoformat()) and _may_try("cash"):
        await _capture_cash(store)
        cash = await store.list_flow_snapshots(KIND_CASH, limit=days)
    positioning = await store.list_flow_snapshots(KIND_OI, limit=days)
    if (not positioning or positioning[0]["date"] < (now().date() - timedelta(days=3)).isoformat()) and _may_try("oi"):
        for day in mf.recent_weekdays(5):
            if (await _capture_oi(store, day))["source"] == "live":
                break
        positioning = await store.list_flow_snapshots(KIND_OI, limit=days)
    cash_rows = [{"date": item["date"], "fii": item["data"]["fii"], "dii": item["data"]["dii"]} for item in reversed(cash)]
    _cumulative(cash_rows, "fii")
    _cumulative(cash_rows, "dii")
    oi_rows = []
    for item in reversed(positioning):
        data = item["data"]
        participants = data.get("participants", {})
        oi_rows.append(
            {
                "date": item["date"],
                "fiiIndexFuturesLongShare": data.get("fiiIndexFuturesLongShare"),
                "indexFuturesNet": {name: (values.get("futIndexLong", 0) - values.get("futIndexShort", 0)) for name, values in participants.items()},
                "participants": participants,
            }
        )
    return {
        "cash": cash_rows,
        "positioning": oi_rows,
        "unit": {"cash": "INR crore", "positioning": "contracts"},
        "asOf": {"cash": cash_rows[-1]["date"] if cash_rows else None, "positioning": oi_rows[-1]["date"] if oi_rows else None},
        "historySince": {"cash": cash_rows[0]["date"] if cash_rows else None, "positioning": oi_rows[0]["date"] if oi_rows else None},
        "source": "stored",
        "health": {key: HEALTH.get(key) for key in ("nse_fii_dii", "nse_participant_oi")},
        "today": today,
    }


async def _index_returns(range_name: str) -> List[Dict[str, Any]]:
    charts = await asyncio.gather(*(market.get_chart(symbol, range_name, "1d") for symbol, _ in SECTOR_INDICES), return_exceptions=True)
    out = []
    for (symbol, label), chart in zip(SECTOR_INDICES, charts):
        points = chart.get("points", []) if isinstance(chart, dict) and chart.get("source") in {"live", "cached"} else []
        if len(points) >= 2 and points[0].get("close"):
            out.append({"symbol": symbol, "label": label, "return": points[-1]["close"] / points[0]["close"] - 1, "from": points[0]["timestamp"][:10], "to": points[-1]["timestamp"][:10]})
        else:
            out.append({"symbol": symbol, "label": label, "return": None, "reason": "Yahoo has no price history for this index"})
    return out


async def sectors(store: Any, periods: int = 6, performance_range: str = "1mo") -> Dict[str, Any]:
    stored = await store.list_flow_snapshots(KIND_SECTOR, limit=periods)
    stale = not stored or stored[0]["date"] < (now().date() - timedelta(days=17)).isoformat()
    if stale and _may_try("sector"):
        if not stored:
            # Interactive path: two reports at most; the scheduled capture builds the longer history.
            names = await asyncio.to_thread(mf.list_sector_reports, min(periods, 2))
            for name in names:
                await _capture_sector(store, name)
        else:
            await _capture_sector(store)
        stored = await store.list_flow_snapshots(KIND_SECTOR, limit=periods)
    reports = [{"date": item["date"], "period": item["data"].get("period"), "sectors": item["data"]["sectors"], "total": item["data"].get("total")} for item in reversed(stored)]
    return {
        "reports": reports,
        "unit": "INR crore",
        "frequency": "fortnightly",
        "asOf": reports[-1]["date"] if reports else None,
        "indexPerformance": await _index_returns(performance_range),
        "performanceRange": performance_range,
        "health": HEALTH.get("nsdl_sector"),
    }


async def company_capex(symbols: List[str]) -> List[Dict[str, Any]]:
    async def one(symbol: str) -> Dict[str, Any]:
        key = f"capex:{symbol.upper()}"
        cached = await market._cache_get(key)  # noqa: SLF001 - shared cache helper of the market-data service
        if cached is not None:
            return cached
        result = await asyncio.to_thread(mf.fetch_company_capex, symbol)
        result["symbol"] = symbol.upper()
        entry = symbol_catalog.lookup(symbol)
        result["name"] = entry["name"] if entry else symbol.upper()
        result["sector"] = entry.get("sector") if entry else None
        if result["source"] == "live":
            await market._cache_set(key, result, CAPEX_TTL_SECONDS)  # noqa: SLF001
        return result

    gate = asyncio.Semaphore(6)

    async def limited(symbol: str) -> Dict[str, Any]:
        async with gate:
            return await one(symbol)

    return await asyncio.gather(*(limited(symbol) for symbol in symbols))


def nifty50_with_sectors() -> List[Dict[str, Any]]:
    catalog = symbol_catalog._catalog()["entries"]  # noqa: SLF001 - read-only access to the loaded catalog
    return [entry for entry in catalog.values() if entry["exchange"] == "NSE" and entry["type"] == "EQ" and entry.get("tier") == 2 and entry.get("sector")]


async def sector_capex(store: Any, force: bool = False) -> Dict[str, Any]:
    stored = await store.list_flow_snapshots(KIND_SECTOR_CAPEX, limit=1)
    fresh = stored and stored[0]["date"] >= (now().date() - timedelta(days=SECTOR_CAPEX_MAX_AGE_DAYS)).isoformat()
    if fresh and not force:
        return {"source": "stored", "asOf": stored[0]["date"], **stored[0]["data"]}
    universe = nifty50_with_sectors()
    results = await company_capex([entry["symbol"] for entry in universe])
    companies = [result for result in results if result["source"] == "live"]
    if not companies:
        if stored:
            return {"source": "stored", "asOf": stored[0]["date"], **stored[0]["data"], "note": "Couldn't refresh from Yahoo; showing the last stored aggregate."}
        return {"source": "unavailable", "reason": "Yahoo didn't return financial statements right now."}
    aggregate = mf.aggregate_sector_capex(companies) | {"universe": "Nifty 50", "coverage": {"reporting": len(companies), "total": len(universe)}, "currency": "INR"}
    await store.upsert_flow_snapshot(KIND_SECTOR_CAPEX, now().date().isoformat(), aggregate, "live")
    return {"source": "live", "asOf": now().date().isoformat(), **aggregate}
