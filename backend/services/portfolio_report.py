"""Portfolio report: risk, concentration, exposure and benchmark analytics for real holdings.

Data: latest quotes (equities/ETFs), AMFI NAVs (funds), daily FX for non-INR listings, daily price
history through the cached market-data service, fund NAV history from mfapi.in. Every position
carries its price source; anything without a usable price is listed, not guessed.
Worst case: 100 instruments → ~100 cached history fetches, 6 at a time (well inside the 300 s
function limit; typically a few seconds when cached).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import pandas as pd

from backend.analytics import portfolio as pa
from backend.analytics.metrics import sanitize
from backend.services import amfi
from backend.services import market_data_service as market
from backend.services.backtesting_service import bars_from_points
from backend.services.clock import now
from backend.services.simulation_service import exchange_timezone

logger = logging.getLogger("algo_trade_backend.portfolio_report")

LIVE_SOURCES = {"live", "cached"}
RANGE_DAYS = {"6mo": 183, "1y": 365, "2y": 730, "5y": 1826}
HISTORY_CONCURRENCY = 6
DISCLAIMER = "Research analytics, not financial advice."


def position_key(holding: Dict[str, Any]) -> str:
    if holding.get("symbol"):
        return str(holding["symbol"]).upper()
    if holding.get("schemeCode"):
        return f"MF:{holding['schemeCode']}"
    return f"ISIN:{holding.get('isin')}"


def aggregate(holdings: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Combine lots of the same instrument; cost is known only when every lot has one."""
    positions: Dict[str, Dict[str, Any]] = {}
    for holding in holdings:
        key = position_key(holding)
        position = positions.setdefault(
            key,
            {
                "key": key,
                "label": holding.get("name") or key,
                "symbol": holding.get("symbol"),
                "isin": holding.get("isin"),
                "schemeCode": holding.get("schemeCode"),
                "currency": holding.get("currency") or "INR",
                "assetType": holding.get("assetType"),
                "sector": holding.get("sector"),
                "quantity": 0.0,
                "costKnown": True,
                "costNative": 0.0,
                "lots": [],
            },
        )
        quantity = float(holding["quantity"])
        position["quantity"] += quantity
        if holding.get("avgCost") is None:
            position["costKnown"] = False
        else:
            position["costNative"] += quantity * float(holding["avgCost"])
        position["lots"].append({"quantity": quantity, "avgCost": holding.get("avgCost"), "buyDate": holding.get("buyDate")})
    return positions


async def _gather_limited(coros: List[Any]) -> List[Any]:
    gate = asyncio.Semaphore(HISTORY_CONCURRENCY)

    async def run(coro: Any) -> Any:
        async with gate:
            try:
                return await coro
            except Exception:  # noqa: BLE001 - one instrument's data must not break the report
                logger.warning("Price history unavailable for one instrument")
                return None

    return await asyncio.gather(*(run(coro) for coro in coros))


def _local_close(chart: Optional[Dict[str, Any]], symbol: str) -> Optional[pd.Series]:
    if not chart or chart.get("source") not in LIVE_SOURCES:
        return None
    bars = bars_from_points(chart.get("points", []))
    if bars.empty:
        return None
    tz = exchange_timezone(symbol, chart.get("timezone"))
    local = bars.index.tz_convert(ZoneInfo(tz)).tz_localize(None).normalize()
    series = pd.Series(bars["close"].to_numpy(), index=local)
    return series[~series.index.duplicated(keep="last")]


def _nav_series(history: Optional[Dict[str, Any]]) -> Optional[pd.Series]:
    if not history or not history.get("points"):
        return None
    days, values = zip(*history["points"])
    return pd.Series(values, index=pd.DatetimeIndex(days))


async def _fx_rates(currencies: List[str]) -> Dict[str, Tuple[Optional[float], Optional[str]]]:
    pairs = [f"{currency}INR=X" for currency in currencies if currency != "INR"]
    rates: Dict[str, Tuple[Optional[float], Optional[str]]] = {"INR": (1.0, "fixed")}
    if not pairs:
        return rates
    quotes = await market.get_quotes(pairs)
    by_pair = {str(quote.get("symbol", "")).upper(): quote for quote in quotes}
    for currency in currencies:
        if currency == "INR":
            continue
        quote = by_pair.get(f"{currency}INR=X")
        if quote and quote.get("price") and quote.get("source") in LIVE_SOURCES:
            rates[currency] = (float(quote["price"]), quote.get("source"))
        else:
            rates[currency] = (None, None)
    return rates


async def build_report(holdings: List[Dict[str, Any]], *, range_name: str = "1y", benchmark: str = "^NSEI", confidence: float = 0.95, with_context: bool = False) -> Any:
    positions = aggregate(holdings)
    listed = [key for key, position in positions.items() if position["symbol"]]
    funds = [key for key, position in positions.items() if not position["symbol"] and position["schemeCode"]]

    quotes = await market.get_quotes(listed) if listed else []
    quote_by_symbol = {str(quote.get("symbol", "")).upper(): quote for quote in quotes}
    schemes = await asyncio.gather(*(asyncio.to_thread(_safe_scheme, positions[key]["schemeCode"]) for key in funds))
    scheme_by_key = dict(zip(funds, schemes))
    fx = await _fx_rates(sorted({position["currency"] for position in positions.values()}))

    histories = await _gather_limited(
        [market.get_daily_history(positions[key]["symbol"], range_name) for key in listed]
        + [asyncio.to_thread(amfi.nav_history, positions[key]["schemeCode"]) for key in funds]
        + [market.get_daily_history(benchmark, range_name)]
    )
    closes: Dict[str, Optional[pd.Series]] = {}
    for key, chart in zip(listed, histories[: len(listed)]):
        closes[key] = _local_close(chart, positions[key]["symbol"])
    for key, history in zip(funds, histories[len(listed) : len(listed) + len(funds)]):
        closes[key] = _nav_series(history)
    bench_close = _local_close(histories[-1], benchmark)
    bench_source = (histories[-1] or {}).get("source")

    # Prices and INR values.
    rows: List[Dict[str, Any]] = []
    unpriced: List[Dict[str, str]] = []
    for key, position in positions.items():
        price, source, as_of = None, None, None
        if position["symbol"]:
            quote = quote_by_symbol.get(key)
            if quote and quote.get("price") and quote.get("source") in LIVE_SOURCES:
                price, source, as_of = float(quote["price"]), quote.get("source"), quote.get("updated")
            elif closes.get(key) is not None:
                series = closes[key]
                price, source, as_of = float(series.iloc[-1]), "last_close", series.index[-1].date().isoformat()
        else:
            scheme = scheme_by_key.get(key)
            if scheme:
                price, source, as_of = float(scheme["nav"]), "amfi", scheme.get("navDate")
        rate, fx_source = fx.get(position["currency"], (None, None))
        if price is None or rate is None:
            unpriced.append({"key": key, "label": position["label"], "reason": "No current price" if price is None else f"No {position['currency']}/INR rate"})
            continue
        value = position["quantity"] * price * rate
        cost = position["costNative"] * rate if position["costKnown"] else None
        rows.append(
            position
            | {
                "price": price,
                "priceSource": source,
                "priceAsOf": as_of,
                "fxRate": rate if position["currency"] != "INR" else None,
                "fxSource": fx_source if position["currency"] != "INR" else None,
                "value": value,
                "cost": cost,
                "pnl": value - cost if cost is not None else None,
                "pnlReturn": (value - cost) / cost if cost else None,
            }
        )
    total_value = sum(row["value"] for row in rows)
    weights = pd.Series({row["key"]: row["value"] / total_value for row in rows}) if total_value > 0 else pd.Series(dtype=float)
    sectors = pd.Series({row["key"]: sector_label(row) for row in rows})
    assets = pd.Series({row["key"]: _asset_label(row.get("assetType")) for row in rows})

    window_days = RANGE_DAYS.get(range_name, 365)
    prices, excluded = pa.align_prices({row["key"]: closes.get(row["key"]) for row in rows}, window_days)
    port_returns = pa.weighted_returns(prices, weights)
    bench_returns = None
    if bench_close is not None and not port_returns.empty:
        bench_aligned = bench_close.reindex(prices.index).ffill(limit=5)
        bench_returns = bench_aligned.pct_change().dropna()
    risk, risk_reasons = pa.risk_metrics(port_returns, bench_returns, confidence)
    betas = pa.instrument_betas(prices, bench_returns)
    if bench_returns is not None and len(bench_returns) > 1:
        risk["benchmarkReturn"] = float((1 + bench_returns).prod() - 1)
    else:
        risk["benchmarkReturn"] = None
        risk_reasons["benchmarkReturn"] = "Benchmark prices unavailable"

    equity = (1 + port_returns).cumprod() * 100 if not port_returns.empty else pd.Series(dtype=float)
    bench_curve = (1 + bench_returns).cumprod() * 100 if bench_returns is not None and not bench_returns.empty else pd.Series(dtype=float)
    drawdown = equity / equity.cummax() - 1 if not equity.empty else pd.Series(dtype=float)

    cashflows: List[Tuple[date, float]] = []
    xirr_covered = 0
    for row in rows:
        lots_with_data = [lot for lot in row["lots"] if lot["avgCost"] is not None and lot["buyDate"]]
        if not lots_with_data:
            continue
        xirr_covered += 1
        rate = row["fxRate"] or 1.0
        for lot in lots_with_data:
            cashflows.append((date.fromisoformat(lot["buyDate"]), -lot["quantity"] * float(lot["avgCost"]) * rate))
        cashflows.append((now().date(), sum(lot["quantity"] for lot in lots_with_data) * row["price"] * rate))
    xirr_value, xirr_reason = pa.xirr(cashflows)

    position_rows = sorted(
        (
            {
                "key": row["key"],
                "label": row["label"],
                "symbol": row["symbol"],
                "isin": row["isin"],
                "assetType": row["assetType"],
                "sector": row.get("sector"),
                "currency": row["currency"],
                "quantity": row["quantity"],
                "price": row["price"],
                "priceSource": row["priceSource"],
                "priceAsOf": row["priceAsOf"],
                "fxRate": row["fxRate"],
                "value": row["value"],
                "weight": float(weights.get(row["key"], 0.0)),
                "cost": row["cost"],
                "pnl": row["pnl"],
                "pnlReturn": row["pnlReturn"],
                "beta": betas.get(row["key"]),
                "inRiskFigures": row["key"] in prices.columns,
            }
            for row in rows
        ),
        key=lambda item: item["value"],
        reverse=True,
    )
    known_cost = [row for row in rows if row["cost"] is not None]
    report: Dict[str, Any] = {
        "asOf": now().isoformat(),
        "currency": "INR",
        "range": range_name,
        "confidence": confidence,
        "benchmark": {"symbol": benchmark, "source": bench_source},
        "totals": {
            "value": total_value,
            "positions": len(rows),
            "lots": len(holdings),
            "cost": sum(row["cost"] for row in known_cost) if known_cost else None,
            "costCoverage": len(known_cost) / len(rows) if rows else None,
            "unrealizedPnl": sum(row["pnl"] for row in known_cost) if known_cost else None,
        },
        "positions": position_rows,
        "unpriced": unpriced,
        "concentration": pa.concentration(weights),
        "sectorMix": pa.mix(weights, sectors),
        "assetMix": pa.mix(weights, assets, unknown="Other"),
        "risk": risk,
        "riskReasons": risk_reasons,
        "window": {
            "start": prices.index[0].date().isoformat() if not prices.empty else None,
            "end": prices.index[-1].date().isoformat() if not prices.empty else None,
            "days": int(len(port_returns)),
        },
        "coverage": {"included": [str(key) for key in prices.columns], "excluded": [item | {"label": positions[item["key"]]["label"]} for item in excluded if item["key"] in positions]},
        "equity": [{"timestamp": ts.isoformat(), "value": float(v)} for ts, v in equity.items()],
        "benchmarkCurve": [{"timestamp": ts.isoformat(), "value": float(v)} for ts, v in bench_curve.items()],
        "drawdown": [{"timestamp": ts.isoformat(), "value": float(v)} for ts, v in drawdown.items()],
        "correlation": pa.correlation_matrix(prices, weights),
        "xirr": {"value": xirr_value, "reason": xirr_reason, "positionsCovered": xirr_covered},
        "disclaimer": DISCLAIMER,
    }
    report["observations"] = pa.observations(report)
    if with_context:
        return sanitize(report), {"prices": prices, "benchReturns": bench_returns}
    return sanitize(report)


# Sent to the model provider: weights and figures only — no quantities, costs, values in rupees,
# purchase dates, import ids, or P&L amounts.
MODEL_POSITION_FIELDS = ("label", "symbol", "assetType", "sector", "weight", "beta", "pnlReturn")
MODEL_RISK_FIELDS = ("totalReturn", "benchmarkReturn", "volatility", "sharpe", "maxDrawdown", "var", "cvar", "beta", "correlation", "trackingError")


def model_summary(report: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "range": report["range"],
        "benchmark": report["benchmark"]["symbol"],
        "confidence": report["confidence"],
        "holdings": report["totals"]["positions"],
        "positions": [{key: position.get(key) for key in MODEL_POSITION_FIELDS} for position in report["positions"][:25]],
        "concentration": report["concentration"],
        "sectorMix": report["sectorMix"][:10],
        "assetMix": report["assetMix"],
        "risk": {key: report["risk"].get(key) for key in MODEL_RISK_FIELDS},
        "riskReasons": report["riskReasons"],
        "window": report["window"],
        "xirr": report["xirr"]["value"],
        "excludedFromRisk": [item["label"] for item in report["coverage"]["excluded"]],
        "observations": report["observations"],
        "note": "Analytics of the user's real holdings. Describe; never advise.",
    }


def _safe_scheme(code: Optional[str]) -> Optional[Dict[str, Any]]:
    try:
        return amfi.scheme_by_code(code) if code else None
    except amfi.AmfiUnavailable:
        return None


FALLBACK_SECTORS = {"etf": "ETFs", "mutual_fund": "Mutual funds", "gold": "Gold"}


def sector_label(row: Dict[str, Any]) -> str:
    """Industry for NSE equities; funds and ETFs get their own bucket; anything else is Unclassified."""
    if row.get("assetType") in FALLBACK_SECTORS:
        return FALLBACK_SECTORS[row["assetType"]]
    return row.get("sector") or "Unclassified"


def _asset_label(asset_type: Optional[str]) -> str:
    return {"equity": "Equity", "etf": "ETF", "mutual_fund": "Mutual fund", "gold": "Gold", "other": "Other"}.get(asset_type or "", "Other")


RISK_KEYS = ("volatility", "var", "cvar", "beta", "maxDrawdown")


def what_if(report: Dict[str, Any], context: Dict[str, Any], *, cap: Optional[Tuple[str, float]] = None, remove: List[str] = (), shock: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Recompute concentration, risk figures and the stress estimate under a user-chosen scenario."""
    weights = pd.Series({p["key"]: p["weight"] for p in report["positions"]})
    betas = {p["key"]: p["beta"] for p in report["positions"]}
    sectors = pd.Series({p["key"]: sector_label(p) for p in report["positions"]})
    adjusted = pa.apply_what_if(weights, cap=cap, remove=remove)
    after_risk, after_reasons = pa.risk_metrics(pa.weighted_returns(context["prices"], adjusted), context["benchReturns"], report["confidence"])
    result: Dict[str, Any] = {
        "before": {"concentration": pa.concentration(weights), "sectorMix": pa.mix(weights, sectors), "risk": {key: report["risk"].get(key) for key in RISK_KEYS}},
        "after": {
            "concentration": pa.concentration(adjusted),
            "sectorMix": pa.mix(adjusted, sectors),
            "risk": {key: after_risk.get(key) for key in RISK_KEYS},
            "riskReasons": {key: after_reasons[key] for key in RISK_KEYS if key in after_reasons},
            "weights": {key: float(value) for key, value in adjusted.items()},
        },
    }
    if shock:
        params = {"shock": float(shock["pct"]), "kind": shock["kind"], "betas": betas, "sectors": sectors, "sector": shock.get("sector")}
        before = pa.stress_loss(weights, **params)
        after = pa.stress_loss(adjusted, **params)
        value = report["totals"]["value"] or 0.0
        result["shock"] = {
            "kind": shock["kind"],
            "pct": shock["pct"],
            "sector": shock.get("sector"),
            "before": {"change": before["change"], "changeInr": before["change"] * value if before["change"] is not None else None},
            "after": {"change": after["change"], "changeInr": after["change"] * value if after["change"] is not None else None},
            "assumedBetaOne": before["assumedBetaOne"],
        }
    return sanitize(result)
