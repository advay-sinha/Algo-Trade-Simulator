"""Forward paper trading for saved simulations, computed on read.

A simulation's state is a deterministic function of its frozen config (strategy id + params,
costs, benchmark), its start time and status history, the daily bars up to now, and the latest
quote. Every read replays the strategy over the bars since the start, so there is no background
worker and every serverless instance computes the same result.

Assumptions (also returned with every report):
- Signals use bars up to and including day t (strategy contract) and execute at the next
  session's OPEN. Bars before the start are warm-up only: they feed indicators, never fills.
- A day can fill only if its session opened at or after the simulation started.
- Sizing: whole shares with all available cash on entry; the full position is sold on exit.
- Costs and slippage as in the backtester (bps of notional / against the fill).
- Capital is INR. Non-INR instruments are bought and marked through the daily {CCY}INR=X rate.
- Paused days place no orders; an open position stays marked to market.
- Today's value uses the latest live quote when the session is open.
"""

from __future__ import annotations

import asyncio
import logging
import math
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import pandas as pd

from backend.analytics.metrics import PERIODS_PER_YEAR, sanitize, series_metrics
from backend.analytics.risk import default_benchmark
from backend.models.simulation import SimulationInput, SimulationUpdate
from backend.services import market_data_service as market
from backend.services.backtesting_service import bars_from_points, downsample
from backend.services.clock import now
from backend.services.research_actions import ActionError
from backend.strategies import REGISTRY, Strategy, StrategyParams

logger = logging.getLogger("algo_trade_backend.simulations")

ENGINE_VERSION = 1
MIN_METRIC_DAYS = 20
TERMINAL_STATUSES = {"completed", "archived"}
TRANSITIONS: Dict[str, set] = {
    "active": {"paused", "completed", "archived"},
    "paused": {"active", "completed", "archived"},
    "completed": {"archived"},
    "archived": set(),
}
LIVE_SOURCES = {"live", "cached"}
SUMMARY_CONCURRENCY = 4
SUMMARY_LIMIT = 20
SPARK_POINTS = 40

# Regular sessions (local time). Exchange holidays are not modeled.
SESSIONS: Dict[str, Tuple[time, time]] = {
    "Asia/Kolkata": (time(9, 15), time(15, 30)),
    "America/New_York": (time(9, 30), time(16, 0)),
    "Europe/London": (time(8, 0), time(16, 30)),
}
DEFAULT_SESSION = (time(9, 30), time(16, 0))
# Sub-unit currencies Yahoo reports for some listings.
SUBUNITS = {"GBp": ("GBP", 0.01), "GBX": ("GBP", 0.01), "ZAc": ("ZAR", 0.01), "ILA": ("ILS", 0.01)}
RANGE_DAYS = [("3mo", 90), ("6mo", 180), ("1y", 365), ("2y", 730), ("5y", 1825), ("10y", 3650)]

ASSUMPTIONS = [
    "Signals use data up to each day's close and fill at the next session's open; days before the start only warm up indicators.",
    "Whole shares, using all available cash on entry; the full position is sold on exit.",
    "Costs and slippage are charged on every fill, as in the backtester.",
    "Capital is in INR. Non-INR prices are converted with the daily exchange rate on the fill day.",
    "Paused days place no orders; an open position keeps its market value.",
    "Today's value uses the latest quote while the market is open. Exchange holidays are not modeled.",
]


# ---------------------------------------------------------------------------------------------
# Time helpers


def parse_time(value: Any) -> datetime:
    parsed = datetime.fromisoformat(str(value))
    if parsed.tzinfo is None:
        raise ValueError("Timestamps must be timezone-aware")
    return parsed


def exchange_timezone(symbol: str, chart_tz: Optional[str]) -> str:
    upper = symbol.upper()
    if upper.endswith((".NS", ".BO")) or upper in {"^NSEI", "^NSEBANK", "^BSESN"} or upper.startswith("^CNX"):
        return "Asia/Kolkata"
    if upper.endswith(".L") or upper == "^FTSE":
        return "Europe/London"
    if chart_tz:
        try:
            ZoneInfo(chart_tz)
            return chart_tz
        except (ZoneInfoNotFoundError, ValueError):
            pass
    return "America/New_York"


def session_bounds(day: date, tz_name: str) -> Tuple[datetime, datetime]:
    opens, closes = SESSIONS.get(tz_name, DEFAULT_SESSION)
    zone = ZoneInfo(tz_name)
    return datetime.combine(day, opens, zone), datetime.combine(day, closes, zone)


def local_dates(index: pd.DatetimeIndex, tz_name: str) -> List[date]:
    return [ts.date() for ts in index.tz_convert(ZoneInfo(tz_name))]


def session_state(tz_name: str, at: datetime) -> Dict[str, Any]:
    local = at.astimezone(ZoneInfo(tz_name))
    opens, closes = session_bounds(local.date(), tz_name)
    is_open = local.weekday() < 5 and opens <= local < closes
    return {"timezone": tz_name, "open": is_open, "label": "Market open" if is_open else "Market closed"}


def pick_range(days_needed: int) -> str:
    for name, days in RANGE_DAYS:
        if days_needed <= days:
            return name
    return "max"


def status_at(history: Sequence[Dict[str, Any]], at: datetime, default: str = "active") -> str:
    current = default
    for entry in history:
        if parse_time(entry["at"]) <= at:
            current = entry["status"]
        else:
            break
    return current


def evaluation_end(history: Sequence[Dict[str, Any]], at: datetime) -> Tuple[datetime, bool]:
    """When evaluation stops: the first completed/archived transition, else now."""
    for entry in history:
        if entry["status"] in TERMINAL_STATUSES:
            return min(parse_time(entry["at"]), at), True
    return at, False


# ---------------------------------------------------------------------------------------------
# Strategy resolution and normalization of legacy records


@dataclass
class ResolvedConfig:
    strategy: Strategy
    params: StrategyParams
    started_at: datetime
    history: List[Dict[str, Any]]
    cost_bps: float
    slippage_bps: float
    benchmark: str
    legacy: bool = False
    notes: List[str] = field(default_factory=list)


def _strategy_by_id_or_name(value: str) -> Optional[Strategy]:
    if value in REGISTRY:
        return REGISTRY[value]
    lowered = value.strip().casefold()
    for strategy in REGISTRY.values():
        if strategy.name.casefold() == lowered or strategy.id == lowered:
            return strategy
    return None


def resolve_config(sim: Dict[str, Any]) -> Optional[ResolvedConfig]:
    """Frozen config of a simulation, or None when it predates strategy tracking and can't be mapped."""
    strategy = _strategy_by_id_or_name(str(sim.get("strategy") or ""))
    if strategy is None:
        return None
    try:
        params = strategy.parse_params(sim.get("params") or {})
    except ValueError:
        return None
    legacy = "engineVersion" not in sim
    started_at = parse_time(sim.get("startedAt") or sim["createdAt"])
    history = list(sim.get("statusHistory") or [])
    notes: List[str] = []
    if legacy:
        notes.append("Saved before simulations were tracked: replayed with this strategy's default parameters from the creation date.")
        if not history:
            # Unknown transition times: the current status is assumed to apply from the start.
            history = [{"status": sim.get("status", "active"), "at": started_at.isoformat()}]
    config = sim.get("config") or {}
    return ResolvedConfig(
        strategy=strategy,
        params=params,
        started_at=started_at,
        history=sorted(history, key=lambda entry: parse_time(entry["at"])),
        cost_bps=float(config.get("costBps", 5)),
        slippage_bps=float(config.get("slippageBps", 5)),
        benchmark=str(config.get("benchmark") or default_benchmark(sim["symbol"])).upper(),
        legacy=legacy,
        notes=notes,
    )


# ---------------------------------------------------------------------------------------------
# Pure replay


@dataclass
class ReplayInput:
    bars: pd.DataFrame  # open/close, UTC index, instrument currency (after sub-unit scaling)
    signals: List[int]  # 0/1 per bar, decided at that bar's close
    dates: List[date]  # exchange-local trading date per bar
    session_opens: List[datetime]
    fx: List[float]  # INR per instrument unit, per bar
    capital: float
    cost_bps: float
    slippage_bps: float
    started_at: datetime
    end: datetime
    history: List[Dict[str, Any]]
    strategy_name: str


def _fill_price(open_price: float, side: str, slippage_bps: float) -> float:
    factor = slippage_bps / 10_000
    return open_price * (1 + factor) if side == "buy" else open_price * (1 - factor)


def replay(data: ReplayInput, *, follow_signals: bool = True) -> Dict[str, Any]:
    """Fills and daily INR equity from the first eligible session to the evaluation end.

    follow_signals=False is the buy-and-hold reference: buy at the first eligible open, never sell,
    ignore pauses.
    """
    eligible = [i for i, opened in enumerate(data.session_opens) if data.started_at <= opened <= data.end]
    if not eligible:
        return {"eligible": [], "equity": [], "fills": [], "cash": data.capital, "shares": 0, "costs": 0.0, "inMarketDays": 0, "costBasis": 0.0, "avgPrice": None}
    cost_rate = data.cost_bps / 10_000
    opens = data.bars["open"].to_numpy()
    closes = data.bars["close"].to_numpy()
    cash = float(data.capital)
    shares = 0
    cost_basis = 0.0  # INR incl. entry cost
    avg_price: Optional[float] = None  # instrument currency, incl. slippage
    costs = 0.0
    fills: List[Dict[str, Any]] = []
    equity: List[float] = []
    in_market = 0
    first = eligible[0]

    for i in eligible:
        if follow_signals:
            paused = status_at(data.history, data.session_opens[i]) == "paused"
            desired = data.signals[i - 1] if i > 0 else 0
        else:
            paused = False
            desired = 1
        if not paused and desired == 1 and shares == 0:
            price = _fill_price(float(opens[i]), "buy", data.slippage_bps)
            unit_inr = price * data.fx[i]
            affordable = math.floor(cash / (unit_inr * (1 + cost_rate))) if unit_inr > 0 else 0
            if affordable > 0:
                notional = affordable * unit_inr
                cost = notional * cost_rate
                cash -= notional + cost
                costs += cost
                shares = affordable
                cost_basis = notional + cost
                avg_price = price
                if i == first and follow_signals:
                    reason = "The signal was already long when the simulation started."
                elif follow_signals:
                    reason = f"{data.strategy_name} turned long at the {data.dates[i - 1].isoformat()} close."
                else:
                    reason = "Buy-and-hold reference entry."
                fills.append(_fill(data, i, "buy", price, affordable, notional, cost, reason))
        elif not paused and desired == 0 and shares > 0:
            price = _fill_price(float(opens[i]), "sell", data.slippage_bps)
            notional = shares * price * data.fx[i]
            cost = notional * cost_rate
            cash += notional - cost
            costs += cost
            pnl = (notional - cost) - cost_basis
            reason = f"{data.strategy_name} turned flat at the {data.dates[i - 1].isoformat()} close."
            fills.append(_fill(data, i, "sell", price, shares, notional, cost, reason) | {"pnl": pnl, "returnPct": pnl / cost_basis if cost_basis else None})
            shares = 0
            cost_basis = 0.0
            avg_price = None
        if shares > 0:
            in_market += 1
        equity.append(cash + shares * float(closes[i]) * data.fx[i])

    return {"eligible": eligible, "equity": equity, "fills": fills, "cash": cash, "shares": shares, "costs": costs, "inMarketDays": in_market, "costBasis": cost_basis, "avgPrice": avg_price}


def _fill(data: ReplayInput, i: int, side: str, price: float, shares: int, notional: float, cost: float, reason: str) -> Dict[str, Any]:
    return {
        "side": side,
        "time": data.session_opens[i].isoformat(),
        "date": data.dates[i].isoformat(),
        "barTime": data.bars.index[i].isoformat(),
        "price": price,
        "shares": shares,
        "fxRate": data.fx[i],
        "notional": notional,
        "cost": cost,
        "reason": reason,
    }


# ---------------------------------------------------------------------------------------------
# Report assembly


def _series(index: pd.DatetimeIndex, eligible: List[int], values: List[float]) -> List[Dict[str, Any]]:
    return downsample([{"timestamp": index[i].isoformat(), "value": float(v)} for i, v in zip(eligible, values)])


def build_report(
    sim: Dict[str, Any],
    config: ResolvedConfig,
    data: ReplayInput,
    *,
    instrument: Dict[str, Any],
    fx_info: Optional[Dict[str, Any]],
    benchmark_close: Optional[pd.Series],
    benchmark_source: Optional[str],
    mark: Optional[Dict[str, Any]],
    terminal: bool,
    tz_name: str,
    at: datetime,
) -> Dict[str, Any]:
    result = replay(data)
    reference = replay(data, follow_signals=False)
    eligible = result["eligible"]
    index = data.bars.index
    base = _base_report(sim, config, at) | {
        "instrument": instrument,
        "fx": fx_info,
        "session": session_state(tz_name, at),
    }

    last = len(data.bars) - 1
    current_signal = int(data.signals[last]) if data.signals else 0
    provisional = bool(data.dates and session_state(tz_name, at)["open"] and data.dates[last] == at.astimezone(ZoneInfo(tz_name)).date())
    paused_now = status_at(config.history, at) == "paused"

    if not eligible:
        first_open = _next_session_open(data, tz_name, config.started_at)
        pending = None
        if not terminal and current_signal == 1 and not paused_now:
            pending = {"side": "buy", "when": first_open.isoformat() if first_open else None, "provisional": provisional, "reason": f"{config.strategy.name} is long; the first order fills at the next session open."}
        return base | {
            "state": "waiting",
            "reason": "No trading session has opened since the simulation started yet.",
            "signal": {"current": current_signal, "label": "Long" if current_signal else "Flat", "provisional": provisional, "pending": pending},
            "summary": _empty_summary(data.capital),
            "position": None,
            "trades": [],
            "equity": [],
            "buyHold": [],
            "benchmark": [],
            "metrics": {},
            "metricReasons": {},
            "mark": mark,
        }

    equity = list(result["equity"])
    final_i = eligible[-1]
    mark_used = None
    if not terminal and mark and mark.get("price") and result["shares"] > 0 and final_i == last:
        marked = result["cash"] + result["shares"] * float(mark["price"]) * data.fx[final_i]
        equity[-1] = marked
        mark_used = mark
    elif mark and not terminal:
        mark_used = mark
    final_equity = equity[-1]
    equity_series = pd.Series(equity, index=index[eligible])
    reference_equity = reference["equity"] or [data.capital] * len(eligible)
    if not terminal and mark and mark.get("price") and reference["shares"] > 0 and final_i == last:
        reference_equity = list(reference_equity)
        reference_equity[-1] = reference["cash"] + reference["shares"] * float(mark["price"]) * data.fx[final_i]

    bench_points: List[Dict[str, Any]] = []
    benchmark_return: Optional[float] = None
    if benchmark_close is not None and not benchmark_close.empty:
        bench_points, benchmark_return = _benchmark_curve(benchmark_close, data, eligible)

    trading_days = len(eligible)
    metric_values: Dict[str, Optional[float]] = {}
    metric_reasons: Dict[str, str] = {}
    if trading_days >= MIN_METRIC_DAYS:
        metric_values, metric_reasons = series_metrics(equity_series, PERIODS_PER_YEAR["1d"], 0.0)
    else:
        for name in ("volatility", "sharpe", "sortino", "cagr"):
            metric_values[name] = None
            metric_reasons[name] = f"Too early: {trading_days} trading day{'s' if trading_days != 1 else ''} so far; needs {MIN_METRIC_DAYS}."
    drawdown = equity_series / equity_series.cummax() - 1
    metric_values["maxDrawdown"] = float(-drawdown.min())

    position = None
    if result["shares"] > 0:
        last_price = float(mark["price"]) if mark_used and mark_used.get("price") and final_i == last else float(data.bars["close"].iloc[final_i])
        market_value = result["shares"] * last_price * data.fx[final_i]
        position = {
            "shares": result["shares"],
            "avgPrice": result["avgPrice"],
            "lastPrice": last_price,
            "costBasis": result["costBasis"],
            "marketValue": market_value,
            "unrealizedPnl": market_value - result["costBasis"],
            "unrealizedReturn": (market_value - result["costBasis"]) / result["costBasis"] if result["costBasis"] else None,
        }

    held = 1 if result["shares"] > 0 else 0
    pending = None
    if not terminal and not paused_now and current_signal != held:
        side = "buy" if current_signal == 1 else "sell"
        pending = {
            "side": side,
            "when": "next session open",
            "provisional": provisional,
            "reason": (
                f"{config.strategy.name} is {'long' if current_signal else 'flat'} on today's price so far; the order is only placed if that still holds at the close."
                if provisional
                else f"{config.strategy.name} turned {'long' if current_signal else 'flat'} at the {data.dates[last].isoformat()} close; the order fills at the next open."
            ),
        }

    buy_hold_return = reference_equity[-1] / data.capital - 1
    total_return = final_equity / data.capital - 1
    sells = [fill for fill in result["fills"] if fill["side"] == "sell"]
    summary = {
        "startingCapital": data.capital,
        "equity": final_equity,
        "cash": result["cash"],
        "pnl": final_equity - data.capital,
        "totalReturn": total_return,
        "buyHoldReturn": buy_hold_return,
        "excessVsBuyHold": total_return - buy_hold_return,
        "benchmarkReturn": benchmark_return,
        "excessVsBenchmark": (total_return - benchmark_return) if benchmark_return is not None else None,
        "maxDrawdown": metric_values["maxDrawdown"],
        "exposure": result["inMarketDays"] / trading_days,
        "totalCosts": result["costs"],
        "fills": len(result["fills"]),
        "closedTrades": len(sells),
        "winningTrades": sum(1 for fill in sells if fill.get("pnl", 0) > 0),
        "tradingDays": trading_days,
        "firstSession": data.dates[eligible[0]].isoformat(),
        "lastSession": data.dates[final_i].isoformat(),
    }
    return base | {
        "state": "ok",
        "reason": None,
        "signal": {"current": current_signal, "label": "Long" if current_signal else "Flat", "provisional": provisional, "pending": pending, "paused": paused_now},
        "summary": summary,
        "position": position,
        "trades": list(reversed(result["fills"])),
        "equity": _series(index, eligible, equity),
        "buyHold": _series(index, eligible, list(reference_equity)),
        "benchmark": bench_points,
        "benchmarkSource": benchmark_source,
        "metrics": metric_values,
        "metricReasons": metric_reasons,
        "mark": mark_used,
    }


def _next_session_open(data: ReplayInput, tz_name: str, after: datetime) -> Optional[datetime]:
    local = after.astimezone(ZoneInfo(tz_name)).date()
    for offset in range(0, 10):
        day = local + timedelta(days=offset)
        if day.weekday() >= 5:
            continue
        opened, _ = session_bounds(day, tz_name)
        if opened >= after:
            return opened
    return None


def _benchmark_curve(close: pd.Series, data: ReplayInput, eligible: List[int]) -> Tuple[List[Dict[str, Any]], Optional[float]]:
    """Benchmark closes on the simulation's trading days, rebased to the starting capital."""
    by_date = close.groupby(close.index.date).last().sort_index()
    first_date = data.dates[eligible[0]]
    before = by_date[by_date.index < first_date]
    reference = float(before.iloc[-1]) if not before.empty else None
    points: List[Dict[str, Any]] = []
    latest = None
    for i in eligible:
        upto = by_date[by_date.index <= data.dates[i]]
        if upto.empty:
            continue
        value = float(upto.iloc[-1])
        if reference is None:
            reference = value
        latest = value
        points.append({"timestamp": data.bars.index[i].isoformat(), "value": data.capital * value / reference})
    if reference is None or latest is None:
        return [], None
    return downsample(points), latest / reference - 1


def _empty_summary(capital: float) -> Dict[str, Any]:
    return {
        "startingCapital": capital,
        "equity": capital,
        "cash": capital,
        "pnl": 0.0,
        "totalReturn": 0.0,
        "buyHoldReturn": None,
        "excessVsBuyHold": None,
        "benchmarkReturn": None,
        "excessVsBenchmark": None,
        "maxDrawdown": None,
        "exposure": 0.0,
        "totalCosts": 0.0,
        "fills": 0,
        "closedTrades": 0,
        "winningTrades": 0,
        "tradingDays": 0,
        "firstSession": None,
        "lastSession": None,
    }


def _base_report(sim: Dict[str, Any], config: Optional[ResolvedConfig], at: datetime) -> Dict[str, Any]:
    strategy = None
    if config is not None:
        strategy = {"id": config.strategy.id, "name": config.strategy.name, "params": config.params.model_dump()}
    return {
        "simulationId": sim["id"],
        "symbol": sim["symbol"],
        "status": sim.get("status", "active"),
        "currency": "INR",
        "startingCapital": float(sim["startingCapital"]),
        "startedAt": config.started_at.isoformat() if config else sim.get("createdAt"),
        "strategy": strategy,
        "benchmarkSymbol": config.benchmark if config else None,
        "costs": {"costBps": config.cost_bps, "slippageBps": config.slippage_bps} if config else None,
        "legacy": bool(config and config.legacy),
        "notes": config.notes if config else [],
        "assumptions": ASSUMPTIONS,
        "engineVersion": ENGINE_VERSION,
        "asOf": at.isoformat(),
    }


def _unavailable(sim: Dict[str, Any], config: Optional[ResolvedConfig], at: datetime, state: str, reason: str) -> Dict[str, Any]:
    return _base_report(sim, config, at) | {
        "state": state,
        "reason": reason,
        "summary": _empty_summary(float(sim["startingCapital"])),
        "signal": None,
        "position": None,
        "trades": [],
        "equity": [],
        "buyHold": [],
        "benchmark": [],
        "metrics": {},
        "metricReasons": {},
        "mark": None,
        "instrument": None,
        "fx": None,
        "session": None,
    }


# ---------------------------------------------------------------------------------------------
# Data loading (async)


async def evaluate(sim: Dict[str, Any], at: Optional[datetime] = None, quote: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    at = at or now()
    config = resolve_config(sim)
    if config is None:
        return _unavailable(sim, None, at, "needs_setup", "This simulation was saved before strategies were tracked. Choose a strategy to start tracking it.")
    end, terminal = evaluation_end(config.history, at)
    symbol = sim["symbol"].upper()
    warmup_days = int(config.strategy.min_history(config.params) * 1.6) + 10
    days_needed = max(0, (at - config.started_at).days) + warmup_days
    range_name = pick_range(days_needed)

    chart, bench_chart = await asyncio.gather(
        market.get_daily_history(symbol, range_name),
        _optional_history(config.benchmark, range_name) if config.benchmark != symbol else _none(),
    )
    if chart.get("source") not in LIVE_SOURCES:
        return _unavailable(sim, config, at, "unavailable", "Live prices for this symbol are unavailable right now, so the simulation can't be valued. Try again shortly.")
    if config.benchmark == symbol:
        bench_chart = chart
    bars = bars_from_points(chart.get("points", []))
    if len(bars) < 2:
        return _unavailable(sim, config, at, "unavailable", "Not enough price history for this symbol.")

    raw_currency = chart.get("currency") or "INR"
    currency, scale = SUBUNITS.get(raw_currency, (raw_currency.upper(), 1.0))
    if scale != 1.0:
        bars = bars.assign(open=bars["open"] * scale, close=bars["close"] * scale)
    tz_name = exchange_timezone(symbol, chart.get("timezone"))
    dates = local_dates(bars.index, tz_name)
    session_opens = [session_bounds(day, tz_name)[0] for day in dates]

    fx_info: Optional[Dict[str, Any]] = None
    fx = [1.0] * len(bars)
    if currency != "INR":
        pair = f"{currency}INR=X"
        fx_chart = await _optional_history(pair, range_name)
        if not fx_chart or fx_chart.get("source") not in LIVE_SOURCES:
            return _unavailable(sim, config, at, "unavailable", f"The {currency}/INR exchange rate is unavailable right now, so this {currency} instrument can't be valued in INR.")
        fx_bars = bars_from_points(fx_chart.get("points", []))
        fx_by_date = fx_bars["close"].groupby(fx_bars.index.date).last().sort_index()
        fx = []
        for day in dates:
            upto = fx_by_date[fx_by_date.index <= day]
            fx.append(float(upto.iloc[-1]) if not upto.empty else float(fx_by_date.iloc[0]))
        fx_info = {"pair": pair, "rate": fx[-1], "source": fx_chart.get("source"), "basis": "Daily close of the pair on or before each trading day."}

    signals_series = config.strategy.generate_signals(bars, config.params)
    signals = signals_series.reindex(bars.index).fillna(0).astype(int).clip(0, 1).tolist()

    mark = None
    if not terminal:
        if quote is None:
            quotes = await market.get_quotes([symbol])
            quote = next((q for q in quotes if str(q.get("symbol", "")).upper() == symbol), None)
        if quote and quote.get("price") and quote.get("source") in LIVE_SOURCES:
            mark = {"price": float(quote["price"]) * scale, "source": quote.get("source"), "time": quote.get("updated")}

    data = ReplayInput(
        bars=bars,
        signals=signals,
        dates=dates,
        session_opens=session_opens,
        fx=fx,
        capital=float(sim["startingCapital"]),
        cost_bps=config.cost_bps,
        slippage_bps=config.slippage_bps,
        started_at=config.started_at,
        end=end,
        history=config.history,
        strategy_name=config.strategy.name,
    )
    benchmark_close = None
    benchmark_source = None
    if bench_chart and bench_chart.get("source") in LIVE_SOURCES:
        bench_bars = bars_from_points(bench_chart.get("points", []))
        if not bench_bars.empty:
            bench_tz = exchange_timezone(config.benchmark, bench_chart.get("timezone"))
            benchmark_close = pd.Series(bench_bars["close"].to_numpy(), index=pd.DatetimeIndex(bench_bars.index.tz_convert(ZoneInfo(bench_tz))))
            benchmark_source = bench_chart.get("source")
    instrument = {
        "name": chart.get("name"),
        "exchange": chart.get("exchange"),
        "currency": currency,
        "timezone": tz_name,
        "source": chart.get("source"),
    }
    report = build_report(
        sim,
        config,
        data,
        instrument=instrument,
        fx_info=fx_info,
        benchmark_close=benchmark_close,
        benchmark_source=benchmark_source,
        mark=mark,
        terminal=terminal,
        tz_name=tz_name,
        at=at,
    )
    return sanitize(report)


async def _optional_history(symbol: str, range_name: str) -> Optional[Dict[str, Any]]:
    try:
        return await market.get_daily_history(symbol, range_name)
    except Exception:  # noqa: BLE001 - benchmark/FX are optional context; never fail the report on them
        logger.warning("Optional history unavailable for %s", symbol)
        return None


async def _none() -> None:
    return None


def summarize(report: Dict[str, Any]) -> Dict[str, Any]:
    """Compact card-sized view of a report."""
    summary = report.get("summary") or {}
    equity = report.get("equity") or []
    step = max(1, math.ceil(len(equity) / SPARK_POINTS))
    spark = [point["value"] for point in equity[::step]]
    if equity and (not spark or spark[-1] != equity[-1]["value"]):
        spark.append(equity[-1]["value"])
    signal = report.get("signal") or {}
    pending = signal.get("pending") or {}
    return {
        "state": report.get("state"),
        "reason": report.get("reason"),
        "equity": summary.get("equity"),
        "pnl": summary.get("pnl"),
        "totalReturn": summary.get("totalReturn"),
        "buyHoldReturn": summary.get("buyHoldReturn"),
        "excessVsBuyHold": summary.get("excessVsBuyHold"),
        "tradingDays": summary.get("tradingDays"),
        "signal": signal.get("label"),
        "pendingSide": pending.get("side"),
        "spark": spark,
        "asOf": report.get("asOf"),
    }


# ---------------------------------------------------------------------------------------------
# Actions (REST + copilot share these)


def _parse_strategy(strategy_id: str, raw_params: Dict[str, Any]) -> Tuple[Strategy, StrategyParams]:
    strategy = REGISTRY.get(strategy_id)
    if strategy is None:
        raise ActionError(f"Unknown strategy. Choose one of: {', '.join(sorted(REGISTRY))}.")
    try:
        params = strategy.parse_params(raw_params)
    except ValueError as exc:
        first = exc.errors()[0] if hasattr(exc, "errors") else None
        field_name = ".".join(str(part) for part in first.get("loc", ())) if first else ""
        message = str(first.get("msg", "")).removeprefix("Value error, ") if first else ""
        raise ActionError(f"Invalid parameter{f' {field_name}' if field_name else ''}: {message}" if first else "Invalid strategy parameters") from exc
    return strategy, params


def _frozen_config(strategy: Strategy, params: StrategyParams, symbol: str, cost_bps: float, slippage_bps: float, benchmark: Optional[str], started: datetime) -> Dict[str, Any]:
    return {
        "params": params.model_dump(),
        "config": {"costBps": cost_bps, "slippageBps": slippage_bps, "benchmark": (benchmark or default_benchmark(symbol)).upper()},
        "startedAt": started.isoformat(),
        "statusHistory": [{"status": "active", "at": started.isoformat()}],
        "engineVersion": ENGINE_VERSION,
    }


def _refuse_personal_notes(notes: Optional[str]) -> None:
    """Simulation notes are stored free text: personal data refuses the save (never redacted)."""
    from backend.services import pii

    kinds = pii.scan_text(notes or "", "text")
    if kinds:
        raise ActionError(f"Notes weren't saved: they contain what looks like {pii.KIND_LABELS[kinds[0]]}. Remove it and try again.")


async def create_simulation_for_user(payload: SimulationInput, user_id: str, store: Any) -> Dict[str, Any]:
    _refuse_personal_notes(payload.notes)
    strategy, params = _parse_strategy(payload.strategy, payload.params)
    started = now()
    extra = _frozen_config(strategy, params, payload.symbol, payload.costBps, payload.slippageBps, payload.benchmark, started)
    record = await store.add_simulation(user_id, payload.model_copy(update={"strategy": strategy.id, "symbol": payload.symbol.upper()}), extra)
    return public_simulation(record)


async def update_simulation_for_user(user_id: str, sim_id: str, payload: SimulationUpdate, store: Any) -> Dict[str, Any]:
    sim = await store.get_simulation(user_id, sim_id)
    if sim is None:
        raise KeyError("Simulation not found")
    fields: Dict[str, Any] = {}
    at = now()
    if payload.notes is not None:
        _refuse_personal_notes(payload.notes)
        fields["notes"] = payload.notes

    if payload.strategy is not None or payload.params is not None:
        if resolve_config(sim) is not None:
            raise ActionError("A running simulation's strategy can't be changed. Create a new simulation to try different settings.", status=409)
        strategy, params = _parse_strategy(payload.strategy or str(sim.get("strategy")), payload.params or {})
        fields |= {"strategy": strategy.id, "status": "active", "finalReport": None}
        fields |= _frozen_config(strategy, params, sim["symbol"], 5, 5, None, at)
        sim = sim | fields

    if payload.status is not None and payload.status != sim.get("status"):
        current = sim.get("status", "active")
        if payload.status not in TRANSITIONS.get(current, set()):
            raise ActionError(f"A {current} simulation can't move to {payload.status}.", status=409)
        history = list(sim.get("statusHistory") or [])
        if not history and "engineVersion" not in sim:
            # Legacy record: its earlier status is assumed to have applied since creation.
            history = [{"status": current, "at": parse_time(sim.get("startedAt") or sim["createdAt"]).isoformat()}]
        history.append({"status": payload.status, "at": at.isoformat()})
        fields |= {"status": payload.status, "statusHistory": history}
        if payload.status in TERMINAL_STATUSES and resolve_config(sim | fields) is not None:
            report = await evaluate(sim | fields, at)
            fields["finalReport"] = report if report.get("state") in {"ok", "waiting"} else None

    if not fields:
        return public_simulation(sim)
    updated = await store.set_simulation_fields(user_id, sim_id, fields)
    return public_simulation(updated)


async def report_for_user(user_id: str, sim_id: str, store: Any) -> Dict[str, Any]:
    sim = await store.get_simulation(user_id, sim_id)
    if sim is None:
        raise KeyError("Simulation not found")
    stored = sim.get("finalReport")
    if stored and sim.get("status") in TERMINAL_STATUSES:
        return stored | {"status": sim.get("status")}
    report = await evaluate(sim)
    if sim.get("status") in TERMINAL_STATUSES and report.get("state") == "ok":
        # Freeze it: a finished simulation's report never changes.
        await store.set_simulation_fields(user_id, sim_id, {"finalReport": report})
    return report


async def summaries_for_user(user_id: str, store: Any) -> Dict[str, Dict[str, Any]]:
    simulations = await store.list_simulations(user_id)
    out: Dict[str, Dict[str, Any]] = {}
    pending: List[Dict[str, Any]] = []
    for sim in simulations:
        stored = sim.get("finalReport")
        if stored and sim.get("status") in TERMINAL_STATUSES:
            out[sim["id"]] = summarize(stored)
        elif len(pending) < SUMMARY_LIMIT:
            pending.append(sim)
    symbols = sorted({sim["symbol"].upper() for sim in pending if sim.get("status") not in TERMINAL_STATUSES})
    quotes: Dict[str, Dict[str, Any]] = {}
    if symbols:
        try:
            quotes = {str(q.get("symbol", "")).upper(): q for q in await market.get_quotes(symbols)}
        except Exception:  # noqa: BLE001 - summaries fall back to the last close
            logger.warning("Quote batch for simulation summaries failed")
    gate = asyncio.Semaphore(SUMMARY_CONCURRENCY)

    async def one(sim: Dict[str, Any]) -> None:
        async with gate:
            try:
                report = await evaluate(sim, quote=quotes.get(sim["symbol"].upper()) or {})
            except Exception:  # noqa: BLE001 - one bad record must not break the list
                logger.exception("Simulation summary failed")
                report = _unavailable(sim, None, now(), "unavailable", "This simulation couldn't be valued right now.")
            out[sim["id"]] = summarize(report)

    await asyncio.gather(*(one(sim) for sim in pending))
    return out


def public_simulation(record: Dict[str, Any]) -> Dict[str, Any]:
    """API shape: the stored record minus the (large) frozen report."""
    config = resolve_config(record)
    public = {key: value for key, value in record.items() if key not in {"finalReport", "userId"}}
    public["tracking"] = "tracked" if config is not None else "needs_setup"
    if config is not None:
        public["strategyName"] = config.strategy.name
        public["startedAt"] = config.started_at.isoformat()
    return public
