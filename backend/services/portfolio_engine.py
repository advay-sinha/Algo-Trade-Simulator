"""Multi-asset portfolio engine (engine version 2): target weights in, INR ledger out.

Contract (shared by every rule strategy and model in Phase 13):
- A decision is made at the CLOSE of session t from data up to t (strategies only ever receive a
  SnapshotView ending at t). It sets target shares from that close's equity and prices.
- Orders execute at the OPEN of later sessions: sells first, then buys limited by cash after
  costs. A symbol that doesn't trade that session (no bar or zero volume) keeps its order pending;
  a participation cap can spread an order over several sessions. A newer decision replaces
  whatever is still pending. The last session's decision is reported as pending, never filled.
- Whole shares, long only, gross exposure <= 100% (no leverage), cash never negative.
- Costs come from a dated fee schedule (breakdown per fill); slippage moves the fill price
  against the trade.
- Dividends: cash per share on the ex-date for shares held at the prior close (prices are
  split-adjusted but not dividend-adjusted, so this is the only place dividends enter P&L).
- Marks: session close; a symbol without a bar is marked at its last close (stale, counted).
- Deterministic: identical snapshot + decisions + config -> identical result and resultHash.

The single-asset `backtesting_service.run_backtest` (engine v1) and Phase 12 simulations are
unchanged; they size all-in at the fill and are pinned by golden tests.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections import deque
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Deque, Dict, Iterable, List, Literal, Mapping, Optional, Tuple

import numpy as np
import pandas as pd

from backend.research.snapshots import Snapshot, SnapshotView
from backend.services.backtesting_service import downsample
from backend.services.cost_model import COMPONENTS, Brokerage, FeeSchedule, get_schedule, scaled

ENGINE_VERSION = 2
TRADING_DAYS = 252
EPS = 1e-9


class EngineError(ValueError):
    """Invalid configuration or decisions (user-facing message)."""


@dataclass(frozen=True)
class EngineConfig:
    capital: float = 1_000_000.0  # INR
    fee_schedule: str = "nse-delivery"
    brokerage: Literal["zero", "flat", "bps"] = "zero"
    brokerage_flat_inr: float = 20.0
    brokerage_bps: float = 0.0
    cost_bps: float = 0.0  # only for fee_schedule="flat-bps"
    cost_multiplier: float = 1.0  # cost stress (2.0 = every charge doubled)
    slippage_bps: float = 5.0
    max_position_weight: float = 1.0
    max_gross: float = 1.0
    participation_cap: float = 0.0  # max fraction of trailing average daily volume per session; 0 = off
    adv_window: int = 20
    tolerance: float = 0.0  # skip a held position's change when |target - current weight| < tolerance
    min_trade_value: float = 0.0  # INR; smaller changes are skipped
    cash_buffer: float = 0.0  # fraction of equity never invested

    def validate(self) -> None:
        if not self.capital > 0:
            raise EngineError("capital must be positive")
        if not 0 < self.max_gross <= 1.0:
            raise EngineError("max_gross must be in (0, 1]; leveraged mode is not implemented")
        if not 0 < self.max_position_weight <= 1.0:
            raise EngineError("max_position_weight must be in (0, 1]")
        if not 0 <= self.cash_buffer < 1.0:
            raise EngineError("cash_buffer must be in [0, 1)")
        if self.slippage_bps < 0 or self.cost_bps < 0 or self.cost_multiplier < 0:
            raise EngineError("costs can't be negative")
        if not 0 <= self.participation_cap <= 1.0 or self.adv_window < 1:
            raise EngineError("participation_cap must be in [0, 1] and adv_window >= 1")
        if self.tolerance < 0 or self.min_trade_value < 0:
            raise EngineError("tolerance and min_trade_value can't be negative")

    def schedule(self) -> FeeSchedule:
        try:
            base = get_schedule(
                self.fee_schedule,
                brokerage=Brokerage(kind=self.brokerage, flat_inr=self.brokerage_flat_inr, bps=self.brokerage_bps),
                cost_bps=self.cost_bps,
            )
        except KeyError as exc:
            raise EngineError(str(exc.args[0])) from exc
        return base if self.cost_multiplier == 1.0 else scaled(base, self.cost_multiplier)


@dataclass(frozen=True)
class Decision:
    """Target weights decided at a session's close. Missing symbols mean weight 0."""

    weights: Mapping[str, float]
    reasons: Mapping[str, str] = field(default_factory=dict)


StrategyFn = Callable[[SnapshotView], Decision]


def collect_decisions(snapshot: Snapshot, indices: Iterable[int], decide: StrategyFn) -> Dict[int, Decision]:
    """Run a strategy at each decision session with ONLY the data known at that close."""
    return {t: decide(snapshot.view(t)) for t in indices}


def _digest(payload: Any) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


def _round(value: float, places: int = 6) -> float:
    return round(float(value), places)


@dataclass
class _Lot:
    shares: int
    cost_per_share: float  # INR incl. the buy's costs


def run_portfolio(
    snapshot: Snapshot,
    decisions: Mapping[int, Decision],
    config: EngineConfig = EngineConfig(),
    *,
    start: int = 0,
    end: Optional[int] = None,
) -> Dict[str, Any]:
    config.validate()
    schedule = config.schedule()
    last = snapshot.sessions - 1 if end is None else end
    if not 0 <= start < last <= snapshot.sessions - 1:
        raise EngineError("The run needs at least two sessions inside the snapshot")
    symbols = snapshot.symbols
    position = {symbol: j for j, symbol in enumerate(symbols)}
    for t, decision in decisions.items():
        unknown = [symbol for symbol in decision.weights if symbol not in position]
        if unknown:
            raise EngineError(f"Decision on {snapshot.dates[t]} names symbols outside the snapshot: {', '.join(unknown[:5])}")
        if any(not math.isfinite(w) or w < 0 for w in decision.weights.values()):
            raise EngineError(f"Decision on {snapshot.dates[t]} has negative or non-finite weights (long-only engine)")

    arrays = snapshot.arrays
    opens, closes, volumes, dividends = arrays["open"], arrays["close"], arrays["volume"], arrays["dividend"]
    n = len(symbols)
    slip = config.slippage_bps / 10_000
    adv = pd.DataFrame(np.where(np.isfinite(volumes), volumes, np.nan)).rolling(config.adv_window, min_periods=1).mean().shift(1).to_numpy()

    cash = float(config.capital)
    shares = np.zeros(n, dtype=np.int64)
    lots: List[Deque[_Lot]] = [deque() for _ in range(n)]
    last_close = np.full(n, np.nan)
    stale = np.zeros(n, dtype=np.int64)
    pending: Optional[Dict[str, Any]] = None  # {"decidedAt": idx, "target": np.ndarray[int], "reasons": {...}}

    equity_values: List[float] = []
    cash_values: List[float] = []
    gross_values: List[float] = []
    fills: List[Dict[str, Any]] = []
    events: List[Dict[str, Any]] = []
    decision_log: List[Dict[str, Any]] = []
    holdings_log: List[Dict[str, Any]] = []
    dividend_log: List[Dict[str, Any]] = []
    cost_totals = {component: 0.0 for component in COMPONENTS}
    traded_notional = 0.0
    realised = 0.0
    dividends_total = 0.0
    stale_marks = 0
    min_cash = cash

    def mark_prices() -> np.ndarray:
        return np.where(np.isfinite(last_close), last_close, 0.0)

    def execute(i: int) -> None:
        nonlocal cash, pending, traded_notional, realised
        assert pending is not None
        target = pending["target"]
        day = snapshot.dates[i]
        diff = target - shares
        if not diff.any():
            pending = None
            return
        tradable = np.isfinite(opens[i]) & (np.nan_to_num(volumes[i], nan=0.0) > 0)
        caps = np.full(n, np.iinfo(np.int64).max, dtype=np.int64)
        if config.participation_cap > 0:
            caps = np.floor(np.nan_to_num(adv[i], nan=0.0) * config.participation_cap).astype(np.int64)
        reasons = pending["reasons"]

        def record_blocked(j: int, kind: str) -> None:
            key = (pending["decidedAt"], j, kind)
            if key not in pending["logged"]:
                pending["logged"].add(key)
                events.append({"date": day.isoformat(), "symbol": symbols[j], "event": kind, "decidedOn": snapshot.dates[pending["decidedAt"]].isoformat()})

        # Sells first: they free cash for the buys.
        for j in np.flatnonzero(diff < 0):
            if not tradable[j]:
                record_blocked(j, "not_tradable")
                continue
            qty = int(min(-diff[j], caps[j]))
            if qty < -diff[j]:
                record_blocked(j, "participation_capped")
            if qty <= 0:
                continue
            price = float(opens[i, j]) * (1 - slip)
            notional = qty * price
            costs = schedule.costs("sell", notional, day)
            cash += notional - costs["total"]
            consumed_cost = 0.0
            remaining = qty
            while remaining > 0:
                lot = lots[j][0]
                take = min(lot.shares, remaining)
                consumed_cost += take * lot.cost_per_share
                lot.shares -= take
                remaining -= take
                if lot.shares == 0:
                    lots[j].popleft()
            pnl = notional - costs["total"] - consumed_cost
            realised += pnl
            shares[j] -= qty
            traded_notional += notional
            for component in COMPONENTS:
                cost_totals[component] += costs[component]
            fills.append(
                {
                    "date": day.isoformat(),
                    "symbol": symbols[j],
                    "side": "sell",
                    "shares": qty,
                    "price": price,
                    "notional": notional,
                    "costs": {component: costs[component] for component in COMPONENTS},
                    "costTotal": costs["total"],
                    "feeSchedule": schedule.id,
                    "feeVersion": schedule.version_for(day).effective_from.isoformat(),
                    "realisedPnl": pnl,
                    "decidedOn": snapshot.dates[pending["decidedAt"]].isoformat(),
                    "reason": reasons.get(symbols[j]) or "Reduced to the target weight.",
                }
            )

        # Buys, scaled down together if cash (after costs) can't cover them all.
        wanted: Dict[int, int] = {}
        for j in np.flatnonzero(diff > 0):
            if not tradable[j]:
                record_blocked(j, "not_tradable")
                continue
            qty = int(min(diff[j], caps[j]))
            if qty < diff[j]:
                record_blocked(j, "participation_capped")
            if qty > 0:
                wanted[int(j)] = qty

        def buy_cost(j: int, qty: int) -> Tuple[float, Dict[str, float]]:
            price = float(opens[i, j]) * (1 + slip)
            costs = schedule.costs("buy", qty * price, day)
            return qty * price + costs["total"], costs

        need = sum(buy_cost(j, qty)[0] for j, qty in wanted.items())
        if need > cash + EPS and wanted:
            asked = dict(wanted)
            ratio = max(cash, 0.0) / need
            wanted = {j: int(math.floor(qty * ratio)) for j, qty in wanted.items()}
            while wanted and sum(buy_cost(j, qty)[0] for j, qty in wanted.items() if qty > 0) > cash + EPS:
                largest = max((j for j in wanted if wanted[j] > 0), key=lambda j: wanted[j] * float(opens[i, j]))
                wanted[largest] -= 1
            for j in wanted:
                if wanted[j] < asked[j]:
                    record_blocked(j, "cash_limited")
            # What cash couldn't cover is dropped, not chased later at different prices.
            for j, qty in wanted.items():
                target[j] = shares[j] + qty
        for j, qty in sorted(wanted.items()):
            if qty <= 0:
                continue
            total, costs = buy_cost(j, qty)
            price = float(opens[i, j]) * (1 + slip)
            cash -= total
            shares[j] += qty
            lots[j].append(_Lot(qty, total / qty))
            traded_notional += qty * price
            for component in COMPONENTS:
                cost_totals[component] += costs[component]
            fills.append(
                {
                    "date": day.isoformat(),
                    "symbol": symbols[j],
                    "side": "buy",
                    "shares": qty,
                    "price": price,
                    "notional": qty * price,
                    "costs": {component: costs[component] for component in COMPONENTS},
                    "costTotal": costs["total"],
                    "feeSchedule": schedule.id,
                    "feeVersion": schedule.version_for(day).effective_from.isoformat(),
                    "realisedPnl": None,
                    "decidedOn": snapshot.dates[pending["decidedAt"]].isoformat(),
                    "reason": reasons.get(symbols[j]) or "Raised to the target weight.",
                }
            )
        if cash < -1e-6:
            raise RuntimeError("Engine invariant broken: negative cash")  # pragma: no cover - guarded above
        if not (target - shares).any():
            pending = None

    previous_holdings: Optional[Dict[str, int]] = None
    for i in range(start, last + 1):
        day = snapshot.dates[i]
        # 1) Dividends on the ex-date for shares held at the prior close.
        paying = np.flatnonzero((shares > 0) & (np.nan_to_num(dividends[i], nan=0.0) > 0))
        for j in paying:
            amount = float(shares[j]) * float(dividends[i, j])
            cash += amount
            dividends_total += amount
            dividend_log.append({"date": day.isoformat(), "symbol": symbols[j], "shares": int(shares[j]), "perShare": float(dividends[i, j]), "amount": amount})
        # 2) Orders at the open.
        if pending is not None and i > pending["decidedAt"]:
            execute(i)
        # 3) Marks at the close.
        has_close = np.isfinite(closes[i])
        stale_now = (~has_close) & (shares > 0)
        stale_marks += int(stale_now.sum())
        stale = np.where(has_close, 0, stale + 1)
        last_close = np.where(has_close, closes[i], last_close)
        marks = mark_prices()
        holdings_value = float((shares * marks).sum())
        equity = cash + holdings_value
        equity_values.append(equity)
        cash_values.append(cash)
        gross_values.append(holdings_value / equity if equity > 0 else 0.0)
        min_cash = min(min_cash, cash)
        held = {symbols[j]: int(shares[j]) for j in np.flatnonzero(shares)}
        if held != previous_holdings:
            holdings_log.append({"date": day.isoformat(), "positions": held})
            previous_holdings = held
        # 4) A decision at this close sets new targets (replacing anything still pending).
        decision = decisions.get(i)
        if decision is not None:
            pending = _targets(i, decision, equity, marks, shares, config, snapshot, events)
            decision_log.append(
                {
                    "date": day.isoformat(),
                    "weights": {symbol: _round(w) for symbol, w in sorted(decision.weights.items()) if w > 0},
                    "reasons": dict(decision.reasons),
                    "equity": equity,
                }
            )
            if not (pending["target"] - shares).any():
                pending = None

    index = pd.DatetimeIndex(pd.to_datetime([d.isoformat() for d in snapshot.dates[start : last + 1]]), tz="UTC")
    equity_series = pd.Series(equity_values, index=index)
    drawdown = equity_series / equity_series.cummax() - 1
    final_marks = mark_prices()
    unrealised = 0.0
    for j in np.flatnonzero(shares):
        unrealised += float(shares[j]) * final_marks[j] - sum(lot.shares * lot.cost_per_share for lot in lots[j])
    sessions = last - start + 1
    mean_equity = float(np.mean(equity_values))
    turnover = traded_notional / 2 / mean_equity if mean_equity > 0 else 0.0
    pending_orders = []
    if pending is not None:
        diff = pending["target"] - shares
        for j in np.flatnonzero(diff):
            pending_orders.append(
                {
                    "symbol": symbols[j],
                    "side": "buy" if diff[j] > 0 else "sell",
                    "shares": int(abs(diff[j])),
                    "decidedOn": snapshot.dates[pending["decidedAt"]].isoformat(),
                    "reason": pending["reasons"].get(symbols[j]),
                }
            )

    config_payload = asdict(config)
    decisions_digest = _digest({snapshot.dates[t].isoformat(): {"w": {k: _round(v, 10) for k, v in sorted(d.weights.items())}} for t, d in sorted(decisions.items())})
    summary = {
        "startingCapital": config.capital,
        "finalEquity": equity_values[-1],
        "totalReturn": equity_values[-1] / config.capital - 1,
        "maxDrawdown": float(-drawdown.min()),
        "realisedPnl": realised,
        "unrealisedPnl": unrealised,
        "dividends": dividends_total,
        "totalCosts": sum(cost_totals.values()),
        "costBreakdown": dict(cost_totals),
        "tradedNotional": traded_notional,
        "turnover": turnover,
        "annualTurnover": turnover * TRADING_DAYS / sessions,
        "averageExposure": float(np.mean(gross_values)),
        "fills": len(fills),
        "staleMarks": stale_marks,
        "minimumCash": min_cash,
        "endingCash": cash,
        "openPositions": int(np.count_nonzero(shares)),
    }
    result_payload = {
        "equity": [_round(v) for v in equity_values],
        "fills": [[f["date"], f["symbol"], f["side"], f["shares"], _round(f["price"]), _round(f["costTotal"])] for f in fills],
        "dividends": [[d["date"], d["symbol"], _round(d["amount"])] for d in dividend_log],
    }
    return {
        "engineVersion": ENGINE_VERSION,
        "datasetVersion": snapshot.version,
        "universe": snapshot.universe,
        "period": {"start": snapshot.dates[start].isoformat(), "end": snapshot.dates[last].isoformat(), "sessions": sessions},
        "config": config_payload,
        "feeSchedule": schedule.describe(),
        "configHash": _digest({"config": config_payload, "dataset": snapshot.version, "decisions": decisions_digest, "start": start, "end": last}),
        "resultHash": _digest(result_payload),
        "summary": summary,
        "equity": downsample([{"timestamp": ts.isoformat(), "value": float(v)} for ts, v in equity_series.items()]),
        "drawdown": downsample([{"timestamp": ts.isoformat(), "value": float(v)} for ts, v in drawdown.items()]),
        "exposure": downsample([{"timestamp": ts.isoformat(), "value": float(v)} for ts, v in zip(index, gross_values)]),
        "fills": fills,
        "orderEvents": events,
        "dividends": dividend_log,
        "decisions": decision_log,
        "holdings": holdings_log,
        "pending": pending_orders,
        "caveats": list(snapshot.meta.get("caveats", [])),
        "survivorshipBiased": bool(snapshot.meta.get("survivorshipBiased", False)),
        "assumptions": assumptions(config, schedule),
        "_series": {"equity": equity_series, "cash": pd.Series(cash_values, index=index), "exposure": pd.Series(gross_values, index=index)},
    }


def _targets(
    i: int,
    decision: Decision,
    equity: float,
    marks: np.ndarray,
    shares: np.ndarray,
    config: EngineConfig,
    snapshot: Snapshot,
    events: List[Dict[str, Any]],
) -> Dict[str, Any]:
    symbols = snapshot.symbols
    n = len(symbols)
    weights = np.zeros(n)
    for symbol, w in decision.weights.items():
        weights[symbols.index(symbol)] = w
    weights = np.minimum(weights, config.max_position_weight)
    gross = weights.sum()
    if gross > config.max_gross:
        weights *= config.max_gross / gross
    investable = max(equity, 0.0) * (1 - config.cash_buffer)
    target = shares.copy()
    day = snapshot.dates[i].isoformat()
    current_value = shares * marks
    for j in range(n):
        price = marks[j]
        if price <= 0 or not np.isfinite(snapshot.arrays["close"][i, j]):
            if weights[j] > 0 or shares[j] > 0:
                events.append({"date": day, "symbol": symbols[j], "event": "no_price_at_decision", "decidedOn": day})
            if weights[j] == 0 and shares[j] > 0 and price > 0:
                target[j] = 0  # exiting needs no fresh price; sold at the next tradable open
            continue
        desired = int(math.floor(weights[j] * investable / price + EPS))
        current_weight = current_value[j] / equity if equity > 0 else 0.0
        if shares[j] > 0 and weights[j] > 0 and abs(weights[j] - current_weight) < config.tolerance:
            continue  # inside the no-trade band
        if desired != shares[j] and abs(desired - shares[j]) * price < config.min_trade_value and desired > 0:
            events.append({"date": day, "symbol": symbols[j], "event": "below_min_trade_value", "decidedOn": day})
            continue
        target[j] = desired
    return {"decidedAt": i, "target": target, "reasons": dict(decision.reasons), "logged": set()}


def assumptions(config: EngineConfig, schedule: FeeSchedule) -> Dict[str, str]:
    return {
        "timing": "Decisions use data up to a session's close and trade at a later session's open; the final decision stays pending.",
        "sizing": f"Target shares = floor(weight x equity at the decision close{' x ' + format(1 - config.cash_buffer, 'g') if config.cash_buffer else ''} / that close); whole shares, long only, gross exposure capped at {config.max_gross:.0%}, single positions at {config.max_position_weight:.0%}.",
        "orderOfFills": "Sells execute before buys; buys are scaled down together when cash after costs runs short.",
        "liquidity": (f"Each session trades at most {config.participation_cap:.1%} of the trailing {config.adv_window}-session average volume; the rest waits." if config.participation_cap else "No participation cap."),
        "untradable": "A symbol without a bar or with zero volume keeps its order pending until it trades or a new decision replaces it.",
        "costs": f"{schedule.name}; brokerage: {schedule.brokerage.describe()}. Breakdown recorded per fill.",
        "slippage": f"{config.slippage_bps:g} bps against every fill.",
        "dividends": "Credited in cash on the ex-date for shares held at the prior close (prices are split-adjusted, not dividend-adjusted).",
        "marks": "Session close; a symbol without a bar is marked at its last close and counted as stale.",
        "currency": "INR.",
    }
