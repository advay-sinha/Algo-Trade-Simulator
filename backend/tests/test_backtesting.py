"""Backtesting engine: accounting, next-bar fills, determinism, and strategy lookahead guards."""

import math

import pandas as pd

from backend.services.backtesting_service import BacktestConfig, run_backtest
from backend.strategies import get_strategy
from backend.tests.helpers import make_bars, make_sine_bars


def _run(bars, signals, capital=100_000, cost=0.0, slip=0.0):
    result = run_backtest(bars, signals, BacktestConfig(capital, cost, slip))
    result.pop("_series")
    return result


def _sma_signals(bars, short=10, long=30):
    strategy = get_strategy("sma-crossover")
    return strategy.generate_signals(bars, strategy.parse_params({"shortWindow": short, "longWindow": long}))


def test_zero_cost_equity_equals_capital_until_first_trade():
    bars = make_sine_bars()
    result = _run(bars, _sma_signals(bars))
    first = result["trades"][0]["entryTime"]
    assert all(point["value"] == 100_000 for point in result["equity"] if point["timestamp"] < first)


def test_trade_count_matches_hand_count():
    bars = make_sine_bars()
    signals = _sma_signals(bars)
    executed = [0] + signals.tolist()[:-1]
    previous = [0] + executed[:-1]
    entries = sum(1 for a, b in zip(previous, executed) if a == 0 and b == 1)
    exits = sum(1 for a, b in zip(previous, executed) if a == 1 and b == 0)
    result = _run(bars, signals)
    assert len(result["trades"]) == entries
    assert result["summary"]["tradeCount"] == exits


def test_entry_fills_at_next_bar_open():
    bars = make_sine_bars()
    signals = _sma_signals(bars)
    first_signal = signals.tolist().index(1)
    trade = _run(bars, signals)["trades"][0]
    assert trade["entryTime"] == bars.index[first_signal + 1].isoformat()
    assert math.isclose(trade["entryPrice"], bars["open"].iloc[first_signal + 1])


def test_deterministic():
    bars = make_bars(300)
    signals = _sma_signals(bars)
    assert _run(bars, signals, cost=5, slip=5) == _run(bars, signals, cost=5, slip=5)


def test_costs_and_slippage_reduce_equity():
    bars = make_sine_bars()
    signals = _sma_signals(bars)
    free = _run(bars, signals)
    costly = _run(bars, signals, cost=10, slip=10)
    assert costly["summary"]["finalEquity"] < free["summary"]["finalEquity"]
    assert costly["summary"]["totalCosts"] > 0


def test_flat_signal_keeps_capital_and_always_long_matches_buy_and_hold():
    bars = make_bars(250)
    flat = _run(bars, pd.Series(0, index=bars.index), capital=50_000, cost=5, slip=5)
    assert flat["summary"]["finalEquity"] == 50_000 and flat["summary"]["tradeCount"] == 0
    always = _run(bars, pd.Series(1, index=bars.index), capital=50_000, cost=5, slip=5)
    assert math.isclose(always["summary"]["totalReturn"], always["summary"]["buyHoldReturn"])


def test_drawdown_series_is_non_positive():
    bars = make_bars(300)
    result = _run(bars, _sma_signals(bars), cost=5, slip=5)
    assert all(point["value"] <= 1e-12 for point in result["drawdown"])
    assert 0 <= result["summary"]["maxDrawdown"] < 1


def test_strategies_never_look_ahead():
    bars = make_bars(320)
    mutated = bars.copy()
    mutated.iloc[220:, :] *= 1.5
    for strategy_id, raw in (
        ("sma-crossover", {"shortWindow": 10, "longWindow": 30}),
        ("momentum", {"lookback": 20}),
        ("mean-reversion", {"lookback": 20, "entryZ": 1.5}),
        ("buy-and-hold", {}),
    ):
        strategy = get_strategy(strategy_id)
        params = strategy.parse_params(raw)
        before = strategy.generate_signals(bars, params).iloc[:220]
        after = strategy.generate_signals(mutated, params).iloc[:220]
        pd.testing.assert_series_equal(before, after, obj=strategy_id)


def test_invalid_parameters_are_rejected():
    strategy = get_strategy("sma-crossover")
    try:
        strategy.parse_params({"shortWindow": 50, "longWindow": 20})
    except ValueError:
        return
    raise AssertionError("short >= long should be rejected")
