"""Event-driven long/flat backtester.

Assumptions (also returned with every result so the UI can show them):
- A signal computed on bar t's close is executed at bar t+1's OPEN. The last bar's signal is
  never executed. No lookahead.
- Sizing: on entry, buy as many WHOLE shares as available cash covers (after costs); on exit,
  sell the whole position. Leftover cash earns nothing.
- Costs: every fill pays notional * cost_bps / 10_000.
- Slippage: buys fill at open * (1 + slippage_bps / 10_000), sells at open * (1 - ...).
- Equity per bar = cash + shares * close. Drawdown = equity / running peak - 1.
- Deterministic: identical inputs always produce identical outputs.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import pandas as pd

MAX_SERIES_POINTS = 2000


@dataclass(frozen=True)
class BacktestConfig:
    starting_capital: float
    cost_bps: float = 0.0
    slippage_bps: float = 0.0


def bars_from_points(points: List[Dict[str, Any]]) -> pd.DataFrame:
    """Chart payload points -> UTC-indexed OHLCV frame, sorted and de-duplicated."""
    frame = pd.DataFrame(points)
    if frame.empty:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)
    frame = frame.drop_duplicates("timestamp", keep="last").set_index("timestamp").sort_index()
    return frame[["open", "high", "low", "close"] + (["volume"] if "volume" in frame else [])].astype(
        {"open": float, "high": float, "low": float, "close": float}
    )


def _fill_price(open_price: float, side: str, slippage_bps: float) -> float:
    factor = slippage_bps / 10_000
    return open_price * (1 + factor) if side == "buy" else open_price * (1 - factor)


def _iso(ts: pd.Timestamp) -> str:
    return ts.isoformat()


def downsample(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if len(rows) <= MAX_SERIES_POINTS:
        return rows
    step = math.ceil(len(rows) / MAX_SERIES_POINTS)
    sampled = rows[::step]
    if sampled[-1] is not rows[-1]:
        sampled.append(rows[-1])
    return sampled


def _simulate(bars: pd.DataFrame, target: List[int], config: BacktestConfig) -> Dict[str, Any]:
    """Core loop. target[i] is the desired position (0/1) to hold from bar i's open."""
    cost_rate = config.cost_bps / 10_000
    cash = float(config.starting_capital)
    shares = 0
    entry: Optional[Dict[str, Any]] = None
    trades: List[Dict[str, Any]] = []
    equity: List[float] = []
    total_costs = 0.0
    bars_in_market = 0
    opens = bars["open"].to_numpy()
    closes = bars["close"].to_numpy()
    index = bars.index

    for i in range(len(bars)):
        desired = target[i]
        if desired == 1 and shares == 0:
            price = _fill_price(opens[i], "buy", config.slippage_bps)
            affordable = math.floor(cash / (price * (1 + cost_rate))) if price > 0 else 0
            if affordable > 0:
                notional = affordable * price
                cost = notional * cost_rate
                cash -= notional + cost
                total_costs += cost
                shares = affordable
                entry = {"entryTime": _iso(index[i]), "entryPrice": price, "shares": shares, "entryCost": cost, "entryNotional": notional}
        elif desired == 0 and shares > 0 and entry is not None:
            price = _fill_price(opens[i], "sell", config.slippage_bps)
            notional = shares * price
            cost = notional * cost_rate
            cash += notional - cost
            total_costs += cost
            pnl = (notional - cost) - (entry["entryNotional"] + entry["entryCost"])
            trades.append(
                {
                    "entryTime": entry["entryTime"],
                    "entryPrice": entry["entryPrice"],
                    "exitTime": _iso(index[i]),
                    "exitPrice": price,
                    "shares": shares,
                    "pnl": pnl,
                    "returnPct": pnl / (entry["entryNotional"] + entry["entryCost"]),
                    "costs": entry["entryCost"] + cost,
                    "open": False,
                }
            )
            shares = 0
            entry = None
        if shares > 0:
            bars_in_market += 1
        equity.append(cash + shares * closes[i])

    if shares > 0 and entry is not None:
        mark = shares * closes[-1]
        pnl = mark - (entry["entryNotional"] + entry["entryCost"])
        trades.append(
            {
                "entryTime": entry["entryTime"],
                "entryPrice": entry["entryPrice"],
                "exitTime": None,
                "exitPrice": float(closes[-1]),
                "shares": shares,
                "pnl": pnl,
                "returnPct": pnl / (entry["entryNotional"] + entry["entryCost"]),
                "costs": entry["entryCost"],
                "open": True,
            }
        )
    return {
        "equity": equity,
        "trades": trades,
        "totalCosts": total_costs,
        "exposure": bars_in_market / len(bars) if len(bars) else 0.0,
    }


def run_backtest(bars: pd.DataFrame, signals: pd.Series, config: BacktestConfig) -> Dict[str, Any]:
    if len(bars) < 2:
        raise ValueError("At least two bars are required")
    aligned = signals.reindex(bars.index).fillna(0).astype(int).clip(0, 1).tolist()
    # Next-bar execution: hold on bar i what the signal said at the close of bar i-1.
    target = [0] + aligned[:-1]
    strategy = _simulate(bars, target, config)
    # Buy-and-hold baseline: enter at the first executable open (bar 1), same costs and slippage.
    baseline = _simulate(bars, [0] + [1] * (len(bars) - 1), config)

    equity = pd.Series(strategy["equity"], index=bars.index)
    drawdown = equity / equity.cummax() - 1
    baseline_equity = pd.Series(baseline["equity"], index=bars.index)

    closed = [trade for trade in strategy["trades"] if not trade["open"]]
    final_equity = float(equity.iloc[-1])
    total_return = final_equity / config.starting_capital - 1
    baseline_return = float(baseline_equity.iloc[-1]) / config.starting_capital - 1

    return {
        "period": {"start": _iso(bars.index[0]), "end": _iso(bars.index[-1]), "bars": len(bars)},
        "summary": {
            "startingCapital": config.starting_capital,
            "finalEquity": final_equity,
            "totalReturn": total_return,
            "buyHoldReturn": baseline_return,
            "excessReturn": total_return - baseline_return,
            "maxDrawdown": float(-drawdown.min()),
            "tradeCount": len(closed),
            "winningTrades": sum(1 for trade in closed if trade["pnl"] > 0),
            "openPosition": any(trade["open"] for trade in strategy["trades"]),
            "exposure": strategy["exposure"],
            "totalCosts": strategy["totalCosts"],
        },
        "equity": downsample([{"timestamp": _iso(ts), "value": float(v)} for ts, v in equity.items()]),
        "drawdown": downsample([{"timestamp": _iso(ts), "value": float(v)} for ts, v in drawdown.items()]),
        "buyHold": downsample([{"timestamp": _iso(ts), "value": float(v)} for ts, v in baseline_equity.items()]),
        "trades": strategy["trades"],
        # Full-resolution series for analytics; callers must pop this before persisting/serializing.
        "_series": {"equity": equity, "buyHold": baseline_equity},
        "assumptions": {
            "fill": "Signals from bar t's close execute at bar t+1's open; the final bar's signal is not executed.",
            "sizing": "Whole shares, using all available cash on entry; the full position is sold on exit.",
            "costs": f"{config.cost_bps:g} bps of notional on every fill.",
            "slippage": f"{config.slippage_bps:g} bps against you on every fill (buys higher, sells lower).",
            "baseline": "Buy-and-hold enters at the same first executable open with the same costs.",
            "prices": "Daily bars, auto-adjusted for splits and dividends.",
        },
    }
