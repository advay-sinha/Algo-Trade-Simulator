"""LangChain tools wrapping the platform's services.

Tools are built per request with the authenticated user's id and store captured in a closure —
the model never supplies (or sees) user identity, so it can't act on anyone else's data. Inputs
are validated by Pydantic schemas mirroring the REST request models; state-changing tools go
through the exact same action functions as the UI.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from backend.models.backtest import BacktestRequest
from backend.models.common import SYMBOL_PATTERN
from backend.models.ml import TrainModelRequest
from backend.services import market_data_service as market
from backend.services.backtesting_service import bars_from_points
from backend.services.hf_inference import NlpError
from backend.services.research_actions import ActionError, model_signal_for_user, run_backtest_for_user, train_model_for_user
from backend.strategies import list_strategies

STATE_CHANGING = {"run_backtest", "train_model", "create_simulation", "save_research_note"}


@dataclass
class ToolContext:
    user_id: str
    store: Any
    # Saved objects created during this message, echoed back to the user and the UI.
    actions: List[Dict[str, Any]] = field(default_factory=list)


class QuoteArgs(BaseModel):
    symbols: List[str] = Field(min_length=1, max_length=10, description="Ticker symbols, e.g. ['AAPL', 'MSFT'].")


class SymbolSearchArgs(BaseModel):
    query: str = Field(min_length=1, max_length=80, description="Company, fund, or ETF name (or partial ticker), e.g. 'Nippon gold ETF' or 'Infosys'.")


class HistoryArgs(BaseModel):
    symbol: str = Field(pattern=SYMBOL_PATTERN)
    range: Literal["1mo", "3mo", "6mo", "1y", "2y", "5y"] = "1y"


class BacktestArgs(BaseModel):
    symbol: str = Field(pattern=SYMBOL_PATTERN)
    strategy: str = Field(description="Strategy id from list_strategies, e.g. 'sma-crossover'.")
    params: Dict[str, float] = Field(default_factory=dict, description="Strategy parameters, e.g. {'shortWindow': 20, 'longWindow': 60}.")
    range: Literal["6mo", "1y", "2y", "5y"] = "1y"
    startingCapital: float = Field(default=100_000, gt=0, le=1_000_000_000)
    costBps: float = Field(default=5, ge=0, le=500)
    slippageBps: float = Field(default=5, ge=0, le=500)
    benchmark: Optional[str] = Field(default=None, pattern=SYMBOL_PATTERN)


class BacktestIdArgs(BaseModel):
    backtest_id: str = Field(min_length=1, max_length=64)


class TrainArgs(BaseModel):
    symbol: str = Field(pattern=SYMBOL_PATTERN)
    model: Literal["logistic", "random_forest", "gradient_boosting"] = "logistic"
    label: Literal["direction", "return_bucket", "volatility_regime"] = "direction"
    horizon: int = Field(default=1, ge=1, le=20)
    range: Literal["1y", "2y", "5y"] = "5y"


class SignalArgs(BaseModel):
    registry_id: Optional[str] = Field(default=None, max_length=64, description="Model id from the registry (e.g. from train_model's modelId).")
    symbol: Optional[str] = Field(default=None, pattern=SYMBOL_PATTERN)


class NoteSearchArgs(BaseModel):
    query: str = Field(min_length=1, max_length=500, description="What to look for in the user's saved notes and reports.")
    k: int = Field(default=5, ge=1, le=10)


class NoteSaveArgs(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=5000)
    kind: Literal["note", "backtest", "model"] = Field(default="note", description="'backtest'/'model' save a summary of that saved object (pass ref_id).")
    ref_id: Optional[str] = Field(default=None, max_length=64, description="Backtest id or model id when kind is backtest/model.")


class SimulationArgs(BaseModel):
    symbol: str = Field(pattern=SYMBOL_PATTERN)
    strategy: str = Field(default="sma-crossover", min_length=1, max_length=60, description="Strategy id from list_strategies.")
    params: Dict[str, float] = Field(default_factory=dict, description="Strategy parameters; omitted ones use defaults.")
    startingCapital: float = Field(gt=0, le=1_000_000_000, description="Paper simulation budget in INR, not the instrument quote currency")
    notes: Optional[str] = Field(default=None, max_length=400)


class NoArgs(BaseModel):
    pass


class PortfolioArgs(BaseModel):
    range: Literal["6mo", "1y", "2y", "5y"] = "1y"
    benchmark: str = Field(default="^NSEI", pattern=SYMBOL_PATTERN, description="Index to compare with, e.g. ^NSEI (Nifty 50) or ^BSESN.")


class FlowDaysArgs(BaseModel):
    days: int = Field(default=20, ge=1, le=120, description="How many recent trading days of flow history to return.")


class SectorFlowArgs(BaseModel):
    periods: int = Field(default=4, ge=1, le=12, description="How many recent fortnightly reports.")


class CapexArgs(BaseModel):
    symbols: List[str] = Field(min_length=1, max_length=5, description="Company tickers, e.g. ['RELIANCE.NS', 'LT.NS'].")


class ResearchRunIdArgs(BaseModel):
    run_id: str = Field(pattern=r"^[0-9a-f]{32}$", description="Research run or comparison id from list_research_runs.")


class ExplainPositionArgs(BaseModel):
    run_id: str = Field(pattern=r"^[0-9a-f]{32}$", description="Research run id (a single run, not a comparison).")
    symbol: str = Field(pattern=SYMBOL_PATTERN, description="Stock in that run, e.g. 'RELIANCE.NS'.")
    date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$", description="As-of date YYYY-MM-DD; default the run's end.")


class SimulationIdArgs(BaseModel):
    simulation_id: str = Field(min_length=1, max_length=64, description="Simulation id from portfolio_overview.")


def _round(value: Any, digits: int = 4) -> Any:
    if isinstance(value, float):
        return round(value, digits) if math.isfinite(value) else None
    if isinstance(value, dict):
        return {key: _round(item, digits) for key, item in value.items()}
    if isinstance(value, list):
        return [_round(item, digits) for item in value]
    return value


def build_tools(ctx: ToolContext) -> List[StructuredTool]:
    async def get_quote(symbols: List[str]) -> Dict[str, Any]:
        from backend.models.common import parse_symbol_list

        quotes = await market.get_quotes(parse_symbol_list(",".join(symbols)))
        return {"quotes": [_round({k: q.get(k) for k in ("symbol", "price", "changePercent", "currency", "source", "updated")}) for q in quotes]}

    async def search_symbols(query: str) -> Dict[str, Any]:
        # The offline fallback echoes the query back as a "symbol"; the model must not mistake that for a listing.
        matches = [m for m in await market.search(query) if m.get("source") == "live"]
        result: Dict[str, Any] = {
            "query": query,
            "matches": [
                {"symbol": m.get("symbol"), "name": m.get("longName") or m.get("shortName"), "exchange": m.get("exchange"), "type": m.get("type")}
                for m in matches[:8]
            ],
        }
        if not matches:
            result["note"] = "No live listings found (search may be unavailable). Search matches distinctive keywords best: retry once with one word from the name or a ticker-like token (e.g. 'goldbees' for Nippon India ETF Gold BeES), otherwise ask the user for the exact symbol."
        return result

    async def get_price_history(symbol: str, range: str = "1y") -> Dict[str, Any]:
        chart = await market.get_daily_history(symbol, range)
        bars = bars_from_points(chart.get("points", []))
        if bars.empty:
            return {"symbol": symbol.upper(), "error": "No history returned"}
        close = bars["close"]
        daily = close.pct_change().dropna()
        return _round(
            {
                "symbol": symbol.upper(),
                "name": chart.get("name"),
                "exchange": chart.get("exchange"),
                "instrumentType": chart.get("instrumentType"),
                "range": range,
                "bars": len(bars),
                "start": bars.index[0].date().isoformat(),
                "end": bars.index[-1].date().isoformat(),
                "firstClose": float(close.iloc[0]),
                "lastClose": float(close.iloc[-1]),
                "periodReturn": float(close.iloc[-1] / close.iloc[0] - 1),
                "high": float(bars["high"].max()),
                "low": float(bars["low"].min()),
                "annualizedVolatility": float(daily.std(ddof=1) * math.sqrt(252)) if len(daily) > 20 else None,
                "currency": chart.get("currency"),
                "source": chart.get("source", "live"),
            }
        )

    async def get_strategies() -> Dict[str, Any]:
        return {"strategies": list_strategies()}

    async def run_backtest(**kwargs: Any) -> Dict[str, Any]:
        payload = BacktestRequest(**BacktestArgs(**kwargs).model_dump())
        record = await run_backtest_for_user(payload, ctx.user_id, ctx.store)
        ctx.actions.append({"type": "backtest", "id": record["id"], "label": f"Backtest {record['symbol']} · {record['strategy']['name']}", "path": f"/backtests/{record['id']}"})
        metrics = (record.get("risk") or {}).get("metrics") or {}
        comparison = (record.get("risk") or {}).get("comparison") or {}
        return _round(
            {
                "backtestId": record["id"],
                "symbol": record["symbol"],
                "strategy": record["strategy"],
                "period": record["period"],
                "summary": record["summary"],
                "risk": {k: metrics.get(k) for k in ("sharpe", "sortino", "cagr", "volatility", "maxDrawdown", "winRate", "profitFactor")},
                "benchmark": {"symbol": record["config"]["benchmark"], "beta": comparison.get("beta"), "alpha": comparison.get("alpha"), "excessReturn": comparison.get("excessReturn")},
                "dataSource": record["dataSource"],
            }
        )

    async def get_backtest_report(backtest_id: str) -> Dict[str, Any]:
        record = await ctx.store.get_backtest(ctx.user_id, backtest_id)
        if not record:
            raise ActionError("Backtest not found", status=404)
        trades = record.get("trades", [])
        return _round(
            {
                "backtestId": record["id"],
                "symbol": record["symbol"],
                "strategy": record["strategy"],
                "config": record["config"],
                "period": record["period"],
                "summary": record["summary"],
                "risk": {k: v for k, v in (record.get("risk") or {}).items() if k in ("metrics", "unavailable", "drawdown", "comparison", "buyHold")},
                "trades": {"count": len(trades), "first": trades[:8], "last": trades[-4:] if len(trades) > 8 else []},
                "assumptions": record.get("assumptions"),
                "dataSource": record.get("dataSource"),
            }
        )

    async def list_backtests() -> Dict[str, Any]:
        items = await ctx.store.list_backtests(ctx.user_id)
        return _round({"backtests": [{k: item.get(k) for k in ("id", "symbol", "strategy", "range", "summary", "createdAt")} for item in items[:10]]})

    async def portfolio_overview() -> Dict[str, Any]:
        from backend.services import simulation_service

        simulations = await ctx.store.list_simulations(ctx.user_id)
        total = sum(float(sim.get("startingCapital") or 0) for sim in simulations)
        by_status: Dict[str, int] = {}
        for sim in simulations:
            by_status[sim.get("status", "unknown")] = by_status.get(sim.get("status", "unknown"), 0) + 1
        summaries = await simulation_service.summaries_for_user(ctx.user_id, ctx.store)
        recent = []
        for sim in simulations[:10]:
            summary = summaries.get(sim["id"]) or {}
            recent.append(
                {k: sim.get(k) for k in ("id", "symbol", "strategy", "startingCapital", "currency", "status", "createdAt")}
                | {k: summary.get(k) for k in ("state", "equity", "pnl", "totalReturn", "buyHoldReturn", "excessVsBuyHold", "tradingDays", "signal", "pendingSide")}
            )
        return _round(
            {
                "simulations": len(simulations),
                "byStatus": by_status,
                "totalStartingCapital": total,
                "currency": "INR",
                "note": "Paper simulations replayed from their start with next-open fills; values in INR.",
                "recent": recent,
            }
        )

    async def analyze_portfolio(range: str = "1y", benchmark: str = "^NSEI") -> Dict[str, Any]:
        from backend.services import portfolio_report

        data = await ctx.store.list_portfolio(ctx.user_id)
        if not data["holdings"]:
            return {"holdings": 0, "message": "The user hasn't imported any holdings yet (Portfolio page)."}
        report = await portfolio_report.build_report(data["holdings"], range_name=range, benchmark=benchmark.upper())
        return _round(portfolio_report.model_summary(report))

    async def get_institutional_flows(days: int = 20) -> Dict[str, Any]:
        from backend.services import flows_service

        data = await flows_service.institutional(ctx.store, days)
        cash = data["cash"][-days:]
        positioning = data["positioning"][-days:]
        return _round(
            {
                "unit": data["unit"],
                "asOf": data["asOf"],
                "historySince": data["historySince"],
                "cash": [{"date": row["date"], "fiiNet": row["fii"]["net"], "diiNet": row["dii"]["net"], "fiiBuy": row["fii"]["buy"], "fiiSell": row["fii"]["sell"], "diiBuy": row["dii"]["buy"], "diiSell": row["dii"]["sell"]} for row in cash],
                "cashTotals": {"fiiNet": sum(row["fii"]["net"] or 0 for row in cash), "diiNet": sum(row["dii"]["net"] or 0 for row in cash), "days": len(cash)},
                "positioning": [
                    {
                        "date": row["date"],
                        "fiiIndexFuturesLongPct": round(row["fiiIndexFuturesLongShare"] * 100, 1) if row["fiiIndexFuturesLongShare"] is not None else None,
                        "fiiIndexFuturesShortPct": round(100 - row["fiiIndexFuturesLongShare"] * 100, 1) if row["fiiIndexFuturesLongShare"] is not None else None,
                        "indexFuturesNetContracts": row["indexFuturesNet"],
                    }
                    for row in positioning
                ],
                "note": (
                    "cash: NSE provisional FII/FPI and DII cash-market activity, INR crore, one row per day (dates are trading days). "
                    "positioning: NSE participant-wise index-futures open interest. fiiIndexFuturesLongPct is the share of FIIs' own "
                    "index-futures contracts that are long (the rest are short); indexFuturesNetContracts is long minus short contracts per "
                    "participant (positive = net long). History starts when the platform began capturing it."
                ),
                "available": bool(cash or positioning),
            }
        )

    async def get_sector_flows(periods: int = 4) -> Dict[str, Any]:
        from backend.services import flows_service

        data = await flows_service.sectors(ctx.store, periods)
        reports = []
        for report in data["reports"]:
            ranked = sorted(report["sectors"], key=lambda item: item["netEquity"] or 0)
            reports.append(
                {
                    "date": report["date"],
                    "period": report["period"],
                    "totalNetEquity": (report.get("total") or {}).get("netEquity"),
                    "largestInflows": [{k: item[k] for k in ("sector", "netEquity", "aucShare")} for item in reversed(ranked[-5:])],
                    "largestOutflows": [{k: item[k] for k in ("sector", "netEquity", "aucShare")} for item in ranked[:5]],
                }
            )
        return _round({"unit": data["unit"], "frequency": data["frequency"], "asOf": data["asOf"], "reports": reports, "sectorIndexReturns": data["indexPerformance"], "performanceRange": data["performanceRange"], "source": "NSDL fortnightly sector-wise FPI data", "available": bool(reports)})

    async def get_company_capex(symbols: List[str]) -> Dict[str, Any]:
        from backend.services import flows_service

        clean = [symbol.upper() for symbol in symbols if re.match(SYMBOL_PATTERN, symbol)]
        results = await flows_service.company_capex(clean[:5])
        out = []
        for result in results:
            if result["source"] != "live":
                out.append({"symbol": result["symbol"], "available": False, "reason": result.get("reason")})
                continue
            data = result["data"]
            currency = data.get("currency") or "INR"
            scale, unit = (1e7, "INR crore") if currency == "INR" else (1e6, f"{currency} million")
            years = [
                {
                    "fiscalYearEnd": year["fiscalYearEnd"],
                    "capex": round(year["capex"] / scale, 1),
                    "operatingCashFlow": round(year["operatingCashFlow"] / scale, 1) if year["operatingCashFlow"] is not None else None,
                    "revenue": round(year["revenue"] / scale, 1) if year["revenue"] is not None else None,
                    "capexGrowthPct": round(year["capexGrowth"] * 100, 1) if year.get("capexGrowth") is not None else None,
                    "capexToRevenuePct": round(year["capexToRevenue"] * 100, 1) if year["capexToRevenue"] is not None else None,
                    "capexToOperatingCashFlowPct": round(year["capexToOperatingCashFlow"] * 100, 1) if year["capexToOperatingCashFlow"] is not None else None,
                }
                for year in data["years"][:4]
            ]
            out.append({"symbol": result["symbol"], "name": result.get("name"), "unit": unit, "frequency": "annual", "asOf": result["asOf"], "years": years})
        return {"companies": out, "note": "Annual figures from reported cash-flow statements; capex is the amount spent (a positive number). Amounts are in the stated unit; *Pct fields are percentages."}

    async def get_sector_capex() -> Dict[str, Any]:
        from backend.services import flows_service

        data = await flows_service.sector_capex(ctx.store)
        if data.get("source") == "unavailable":
            return {"available": False, "reason": data.get("reason")}
        sectors = [
            {
                "sector": item["sector"],
                "companies": item["companies"],
                "years": [
                    {
                        "fiscalYear": year["fiscalYear"],
                        "capexCrore": round(year["capex"] / 1e7, 1),
                        "capexGrowthPct": round(year["capexGrowth"] * 100, 1) if year["capexGrowth"] is not None else None,
                        "capexToRevenuePct": round(year["capexToRevenue"] * 100, 1) if year["capexToRevenue"] is not None else None,
                    }
                    for year in item["years"][:3]
                ],
            }
            for item in data["sectors"]
        ]
        return {"asOf": data["asOf"], "universe": data.get("universe"), "coverage": data.get("coverage"), "unit": "INR crore", "frequency": "annual", "sectors": sectors, "note": "Sum of reported annual capex of Nifty 50 companies by sector; growth is shown only when the same companies reported both years."}

    async def get_simulation_report(simulation_id: str) -> Dict[str, Any]:
        from backend.services import simulation_service

        try:
            report = await simulation_service.report_for_user(ctx.user_id, simulation_id, ctx.store)
        except KeyError as exc:
            raise ActionError("Simulation not found", status=404) from exc
        keep = ("simulationId", "symbol", "status", "state", "reason", "currency", "startedAt", "strategy", "benchmarkSymbol", "instrument", "fx", "session", "signal", "summary", "position", "metrics", "metricReasons", "mark", "notes", "asOf")
        compact = {key: report.get(key) for key in keep}
        compact["recentFills"] = (report.get("trades") or [])[:10]
        return _round(compact)

    async def train_model(**kwargs: Any) -> Dict[str, Any]:
        args = TrainArgs(**kwargs)
        payload = TrainModelRequest(symbol=args.symbol, model=args.model, label=args.label, horizon=args.horizon, range=args.range)
        record = await train_model_for_user(payload, ctx.user_id, ctx.store)
        ctx.actions.append({"type": "model", "id": record["id"], "label": f"Model {record['symbol']} · {record['modelName']}", "path": f"/lab/models/{record['id']}"})
        c = record["classification"]
        s = record["strategy"]
        return _round(
            {
                "modelId": record["id"],
                "symbol": record["symbol"],
                "model": record["modelName"],
                "label": record["label"],
                "split": record["split"],
                "testAccuracy": c["accuracy"],
                "baselineAccuracy": c["baselineAccuracy"],
                "beatsBaseline": c["beatsBaseline"],
                "rocAuc": c["rocAuc"],
                "strategyReturnAfterCosts": s["summary"]["totalReturn"],
                "buyHoldReturn": s["summary"]["buyHoldReturn"],
                "strategySharpe": s["metrics"].get("sharpe"),
            }
        )

    async def get_model_signal(registry_id: Optional[str] = None, symbol: Optional[str] = None) -> Dict[str, Any]:
        if registry_id:
            record = await ctx.store.get_model(ctx.user_id, registry_id)
        elif symbol:
            record = await ctx.store.latest_model(ctx.user_id, symbol)
        else:
            raise ActionError("Provide registry_id or symbol")
        if not record:
            raise ActionError("No trained model found for that request; train one first", status=404)
        return _round(await model_signal_for_user(ctx.store, record))

    async def create_simulation(symbol: str, startingCapital: float, strategy: str = "sma-crossover", params: Optional[Dict[str, float]] = None, notes: Optional[str] = None) -> Dict[str, Any]:
        from backend.models.simulation import SimulationInput  # request model shared with the REST endpoint
        from backend.services.simulation_service import create_simulation_for_user

        payload = SimulationInput(symbol=symbol.upper(), strategy=strategy, params=params or {}, startingCapital=startingCapital, notes=notes)
        record = await create_simulation_for_user(payload, ctx.user_id, ctx.store)
        ctx.actions.append({"type": "simulation", "id": record["id"], "label": f"Simulation {record['symbol']} · INR {record['startingCapital']:,.0f}", "path": f"/simulations/{record['id']}"})
        return {k: record.get(k) for k in ("id", "symbol", "strategy", "params", "startingCapital", "currency", "status", "startedAt")}

    async def search_research_notes(query: str, k: int = 5) -> Dict[str, Any]:
        from backend.llm import rag

        try:
            found = await rag.query(ctx.store, ctx.user_id, query, k)
        except NlpError as exc:
            raise ActionError(exc.message, status=exc.status_code) from exc
        return {"searched": found["searched"], "hits": found["hits"]}

    async def save_research_note(title: str, body: str, kind: str = "note", ref_id: Optional[str] = None) -> Dict[str, Any]:
        from backend.llm import rag

        try:
            record = await rag.create_note(ctx.store, ctx.user_id, kind, title, body, ref_id)
        except rag.NoteError as exc:
            raise ActionError(exc.message, status=exc.status) from exc
        created = record.pop("_created")
        ctx.actions.append({"type": "note", "id": record["id"], "label": f"Note · {record['title']}", "path": "/research"})
        return {"id": record["id"], "title": record["title"], "created": created, "indexed": bool(record.get("embedding")), "sentiment": record.get("sentiment")}

    async def list_research_runs() -> Dict[str, Any]:
        from backend.services.research_explain import run_list_item

        items = await ctx.store.list_research_runs(ctx.user_id, limit=10)
        return {"runs": [run_list_item(item) for item in items], "note": "Paper research on frozen historical data; universes are survivorship-biased."}

    async def get_research_run(run_id: str) -> Dict[str, Any]:
        from backend.services.research_explain import run_report

        record = await ctx.store.get_research_run(ctx.user_id, run_id)
        if not record:
            raise ActionError("Research run not found", status=404)
        return run_report(record)

    async def explain_position(run_id: str, symbol: str, date: Optional[str] = None) -> Dict[str, Any]:
        from backend.services.research_explain import explain_position as explain

        record = await ctx.store.get_research_run(ctx.user_id, run_id)
        if not record:
            raise ActionError("Research run not found", status=404)
        if record.get("kind") != "run":
            raise ActionError("That id is a comparison; pass one of its run ids (rows[].runId from get_research_run)")
        return explain(record, symbol, date)

    async def list_ranking_models() -> Dict[str, Any]:
        from backend.services.ranking_service import summarize_experiment
        from backend.services.research_explain import ranking_summary

        return {"experiments": [ranking_summary(summarize_experiment(item)) for item in (await ctx.store.list_ranking_experiments())[:5]]}

    specs = [
        (search_symbols, "search_symbols", "Find ticker symbols by company/fund/ETF name, with exchange and type. Use it before quoting anything the user names instead of giving an exact ticker.", SymbolSearchArgs),
        (get_quote, "get_quote", "Latest quotes for up to 10 symbols, with data source flags.", QuoteArgs),
        (get_price_history, "get_price_history", "Summary of a symbol's daily price history over a range (instrument name, exchange, currency, return, high/low, volatility).", HistoryArgs),
        (get_strategies, "list_strategies", "Strategies the backtester can run, with their parameters and defaults.", NoArgs),
        (run_backtest, "run_backtest", "Run AND SAVE a backtest with costs and slippage; returns performance, risk metrics, and benchmark comparison.", BacktestArgs),
        (get_backtest_report, "get_backtest_report", "Full saved report for one backtest (metrics, drawdown, trades, assumptions) — use it to explain results.", BacktestIdArgs),
        (list_backtests, "list_backtests", "The user's most recent saved backtests.", NoArgs),
        (portfolio_overview, "portfolio_overview", "The user's paper-trading simulations with current value, P&L, return vs buy-and-hold, and latest signal.", NoArgs),
        (analyze_portfolio, "analyze_portfolio", "Risk and diversification report of the user's real imported holdings: weights by holding, concentration, sector and asset mix, volatility, VaR, drawdown, beta vs an index, and factual observations. No quantities or costs.", PortfolioArgs),
        (get_institutional_flows, "get_institutional_flows", "FII/FPI and DII cash-market buying and selling (INR crore, daily) and FII/DII/Pro/Client index-futures positioning from NSE, with as-of dates.", FlowDaysArgs),
        (get_sector_flows, "get_sector_flows", "Sector-wise foreign portfolio (FPI) net equity investment from NSDL's fortnightly reports, plus recent NSE sector index returns.", SectorFlowArgs),
        (get_company_capex, "get_company_capex", "A company's annual capital expenditure, operating cash flow, revenue, capex growth and capex intensity from reported cash-flow statements.", CapexArgs),
        (get_sector_capex, "get_sector_capex", "Annual capex summed by sector across Nifty 50 companies, with growth and coverage.", NoArgs),
        (get_simulation_report, "get_simulation_report", "Full current report for one simulation: position, fills with the rule that fired, pending order, P&L, comparison with buy-and-hold and the benchmark.", SimulationIdArgs),
        (train_model, "train_model", "Train AND REGISTER an ML model; returns unseen-window accuracy vs baseline and a cost-aware backtest vs buy-and-hold.", TrainArgs),
        (get_model_signal, "get_model_signal", "Latest signal from a registered model (by id, or the newest model for a symbol).", SignalArgs),
        (create_simulation, "create_simulation", "Create AND SAVE a paper-trading simulation for the user.", SimulationArgs),
        (search_research_notes, "search_research_notes", "Semantic search over the user's saved research notes and saved backtest/model summaries; returns the closest matches with similarity scores.", NoteSearchArgs),
        (list_research_runs, "list_research_runs", "The user's recent strategy-research runs and comparisons (universe strategies on frozen data): ids, labels, returns in percent, charges in INR.", NoArgs),
        (get_research_run, "get_research_run", "One research run (metrics in percent, charges in INR, assumptions, caveats) or comparison (every row on identical settings, incl. cost-stress reruns and the index).", ResearchRunIdArgs),
        (explain_position, "explain_position", "Recorded evidence for one stock in one research run: fills with the reason the strategy recorded, target weights at recent decisions, shares held, blocked orders.", ExplainPositionArgs),
        (list_ranking_models, "list_ranking_models", "Stored ML stock-ranking experiments: model names, maturity, validation rank IC, training cutoff.", NoArgs),
        (save_research_note, "save_research_note", "SAVE a research note to the user's research memory (or a summary of a saved backtest/model).", NoteSaveArgs),
    ]
    return [StructuredTool.from_function(coroutine=fn, name=name, description=description, args_schema=schema) for fn, name, description, schema in specs]
