"""LangChain tools wrapping the platform's services.

Tools are built per request with the authenticated user's id and store captured in a closure —
the model never supplies (or sees) user identity, so it can't act on anyone else's data. Inputs
are validated by Pydantic schemas mirroring the REST request models; state-changing tools go
through the exact same action functions as the UI.
"""

from __future__ import annotations

import math
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
    strategy: str = Field(default="sma-crossover", min_length=1, max_length=60)
    startingCapital: float = Field(gt=0, le=1_000_000_000)
    notes: Optional[str] = Field(default=None, max_length=400)


class NoArgs(BaseModel):
    pass


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
        simulations = await ctx.store.list_simulations(ctx.user_id)
        total = sum(float(sim.get("startingCapital") or 0) for sim in simulations)
        by_status: Dict[str, int] = {}
        for sim in simulations:
            by_status[sim.get("status", "unknown")] = by_status.get(sim.get("status", "unknown"), 0) + 1
        return _round(
            {
                "simulations": len(simulations),
                "byStatus": by_status,
                "totalStartingCapital": total,
                "recent": [{k: sim.get(k) for k in ("symbol", "strategy", "startingCapital", "status", "createdAt")} for sim in simulations[:10]],
            }
        )

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

    async def create_simulation(symbol: str, startingCapital: float, strategy: str = "sma-crossover", notes: Optional[str] = None) -> Dict[str, Any]:
        from backend.models.simulation import SimulationInput  # request model shared with the REST endpoint

        payload = SimulationInput(symbol=symbol.upper(), strategy=strategy, startingCapital=startingCapital, notes=notes)
        record = await ctx.store.add_simulation(ctx.user_id, payload)
        ctx.actions.append({"type": "simulation", "id": record["id"], "label": f"Simulation {record['symbol']} · {record['startingCapital']:,.0f}", "path": "/simulations"})
        return {k: record.get(k) for k in ("id", "symbol", "strategy", "startingCapital", "status", "createdAt")}

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

    specs = [
        (search_symbols, "search_symbols", "Find ticker symbols by company/fund/ETF name, with exchange and type. Use it before quoting anything the user names instead of giving an exact ticker.", SymbolSearchArgs),
        (get_quote, "get_quote", "Latest quotes for up to 10 symbols, with data source flags.", QuoteArgs),
        (get_price_history, "get_price_history", "Summary of a symbol's daily price history over a range (instrument name, exchange, currency, return, high/low, volatility).", HistoryArgs),
        (get_strategies, "list_strategies", "Strategies the backtester can run, with their parameters and defaults.", NoArgs),
        (run_backtest, "run_backtest", "Run AND SAVE a backtest with costs and slippage; returns performance, risk metrics, and benchmark comparison.", BacktestArgs),
        (get_backtest_report, "get_backtest_report", "Full saved report for one backtest (metrics, drawdown, trades, assumptions) — use it to explain results.", BacktestIdArgs),
        (list_backtests, "list_backtests", "The user's most recent saved backtests.", NoArgs),
        (portfolio_overview, "portfolio_overview", "Summary of the user's paper-trading simulations.", NoArgs),
        (train_model, "train_model", "Train AND REGISTER an ML model; returns unseen-window accuracy vs baseline and a cost-aware backtest vs buy-and-hold.", TrainArgs),
        (get_model_signal, "get_model_signal", "Latest signal from a registered model (by id, or the newest model for a symbol).", SignalArgs),
        (create_simulation, "create_simulation", "Create AND SAVE a paper-trading simulation for the user.", SimulationArgs),
        (search_research_notes, "search_research_notes", "Semantic search over the user's saved research notes and saved backtest/model summaries; returns the closest matches with similarity scores.", NoteSearchArgs),
        (save_research_note, "save_research_note", "SAVE a research note to the user's research memory (or a summary of a saved backtest/model).", NoteSaveArgs),
    ]
    return [StructuredTool.from_function(coroutine=fn, name=name, description=description, args_schema=schema) for fn, name, description, schema in specs]
