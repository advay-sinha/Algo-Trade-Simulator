"""Golden baseline runs: the regression oracle for engine changes.

Every registered single-asset strategy runs at default params on fixed synthetic bars under three
cost settings, and a Phase 12 simulation replay (engine version 1) runs on fixed IST bars. The
results are compared with the JSON files in tests/golden/. Any intended behaviour change must
regenerate them explicitly and explain why:

    UPDATE_GOLDEN=1 .venv/Scripts/python -m pytest backend/tests/test_baselines.py
"""

from __future__ import annotations

import hashlib
import json
import math
import os
from datetime import timedelta
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd

from backend.services import simulation_service
from backend.services.backtesting_service import BacktestConfig, run_backtest
from backend.services.simulation_service import ReplayInput, local_dates, replay, session_bounds
from backend.strategies import REGISTRY, get_strategy
from backend.tests.helpers import make_bars, make_sine_bars

GOLDEN_DIR = Path(__file__).parent / "golden"
UPDATE = os.getenv("UPDATE_GOLDEN") == "1"
DECIMALS = 6
ABS_TOL = 2e-6
CAPITAL = 100_000.0
COST_SETTINGS = [(0.0, 0.0), (5.0, 5.0), (25.0, 10.0)]
DATASETS = {
    "walk": lambda: make_bars(500, seed=7),
    "sine": lambda: make_sine_bars(300),
}
EXPECTED_STRATEGIES = {"sma-crossover", "mean-reversion", "momentum", "buy-and-hold"}
IST = "Asia/Kolkata"


def _rounded(value: Any) -> Any:
    if isinstance(value, float):
        return None if math.isnan(value) else round(value, DECIMALS)
    if isinstance(value, dict):
        return {key: _rounded(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_rounded(item) for item in value]
    if hasattr(value, "item"):  # numpy scalar
        return _rounded(value.item())
    return value


def _digest(payload: Any) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _diff(expected: Any, actual: Any, path: str = "") -> List[str]:
    """Human-readable differences, floats compared within ABS_TOL."""
    if isinstance(expected, float) and isinstance(actual, (int, float)) and not isinstance(actual, bool):
        return [] if math.isclose(expected, actual, rel_tol=1e-9, abs_tol=ABS_TOL) else [f"{path}: {expected} != {actual}"]
    if isinstance(expected, dict) and isinstance(actual, dict):
        problems = [f"{path}.{key}: missing" for key in expected if key not in actual]
        problems += [f"{path}.{key}: unexpected" for key in actual if key not in expected]
        for key in expected:
            if key in actual:
                problems += _diff(expected[key], actual[key], f"{path}.{key}")
        return problems
    if isinstance(expected, list) and isinstance(actual, list):
        if len(expected) != len(actual):
            return [f"{path}: length {len(expected)} != {len(actual)}"]
        problems: List[str] = []
        for index, (left, right) in enumerate(zip(expected, actual)):
            problems += _diff(left, right, f"{path}[{index}]")
            if len(problems) > 20:
                break
        return problems
    return [] if expected == actual else [f"{path}: {expected!r} != {actual!r}"]


def _check_golden(name: str, payload: Dict[str, Any]) -> None:
    path = GOLDEN_DIR / f"{name}.json"
    payload = _rounded(payload)
    payload["resultHash"] = _digest({key: value for key, value in payload.items() if key != "resultHash"})
    if UPDATE or not path.exists():
        if not UPDATE:
            raise AssertionError(f"Golden file {path.name} is missing; run with UPDATE_GOLDEN=1 to create it")
        GOLDEN_DIR.mkdir(exist_ok=True)
        path.write_text(json.dumps(payload, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        return
    expected = json.loads(path.read_text(encoding="utf-8"))
    problems = _diff({k: v for k, v in expected.items() if k != "resultHash"}, {k: v for k, v in payload.items() if k != "resultHash"})
    assert not problems, f"{name} drifted from its golden baseline:\n" + "\n".join(problems[:20])


# ---------------------------------------------------------------------------------------------
# Single-asset backtests


def _backtest_payload(strategy_id: str) -> Dict[str, Any]:
    strategy = get_strategy(strategy_id)
    params = strategy.parse_params({})
    datasets: Dict[str, Any] = {}
    for dataset_name, factory in DATASETS.items():
        bars = factory()
        signals = strategy.generate_signals(bars, params)
        runs = []
        for cost_bps, slippage_bps in COST_SETTINGS:
            result = run_backtest(bars, signals, BacktestConfig(starting_capital=CAPITAL, cost_bps=cost_bps, slippage_bps=slippage_bps))
            series = result.pop("_series")
            runs.append(
                {
                    "costBps": cost_bps,
                    "slippageBps": slippage_bps,
                    "summary": result["summary"],
                    "trades": result["trades"],
                    "equity": [float(value) for value in series["equity"].to_numpy()],
                    # Same baseline in every file: keep the final value plus a digest of the full curve.
                    "buyHoldFinal": float(series["buyHold"].iloc[-1]),
                    "buyHoldDigest": _digest(_rounded([float(value) for value in series["buyHold"].to_numpy()])),
                }
            )
        datasets[dataset_name] = {
            "bars": len(bars),
            "signals": "".join(str(int(value)) for value in signals.reindex(bars.index).fillna(0).astype(int)),
            "runs": runs,
        }
    return {"strategy": strategy_id, "params": params.model_dump(), "minHistory": strategy.min_history(params), "datasets": datasets}


def test_registry_matches_golden_coverage():
    # A new single-asset strategy must get a golden baseline (add it to EXPECTED_STRATEGIES).
    assert set(REGISTRY) == EXPECTED_STRATEGIES


def test_sma_crossover_matches_golden():
    _check_golden("backtest-sma-crossover", _backtest_payload("sma-crossover"))


def test_mean_reversion_matches_golden():
    _check_golden("backtest-mean-reversion", _backtest_payload("mean-reversion"))


def test_momentum_matches_golden():
    _check_golden("backtest-momentum", _backtest_payload("momentum"))


def test_buy_and_hold_matches_golden():
    _check_golden("backtest-buy-and-hold", _backtest_payload("buy-and-hold"))


def test_backtests_are_deterministic():
    for strategy_id in sorted(EXPECTED_STRATEGIES):
        first = _rounded(_backtest_payload(strategy_id))
        second = _rounded(_backtest_payload(strategy_id))
        assert _digest(first) == _digest(second), strategy_id


# ---------------------------------------------------------------------------------------------
# Phase 12 simulation replay (engine version 1 must keep replaying identically)


def _ist_bars(n: int) -> pd.DataFrame:
    bars = make_sine_bars(n)
    local = pd.DatetimeIndex([ts.tz_localize(None) for ts in bars.index]).tz_localize(IST)
    return bars.set_index(local.tz_convert("UTC"))


def _replay_payload() -> Dict[str, Any]:
    bars = _ist_bars(220)
    strategy = get_strategy("sma-crossover")
    params = strategy.parse_params({})
    signals = [int(value) for value in strategy.generate_signals(bars, params).tolist()]
    dates = local_dates(bars.index, IST)
    opens = [session_bounds(day, IST)[0] for day in dates]
    start = 70
    cases = {
        "inr": {"fx": [1.0] * len(bars), "history": []},
        "fx-and-pause": {
            "fx": [83.0 + 0.01 * i for i in range(len(bars))],
            "history": [
                {"status": "active", "at": (opens[start] - timedelta(hours=1)).isoformat()},
                {"status": "paused", "at": (opens[120] - timedelta(hours=1)).isoformat()},
                {"status": "active", "at": (opens[150] - timedelta(hours=1)).isoformat()},
            ],
        },
    }
    out: Dict[str, Any] = {"engineVersion": simulation_service.ENGINE_VERSION, "signals": "".join(map(str, signals)), "cases": {}}
    for name, case in cases.items():
        data = ReplayInput(
            bars=bars,
            signals=signals,
            dates=dates,
            session_opens=opens,
            fx=case["fx"],
            capital=CAPITAL,
            cost_bps=5.0,
            slippage_bps=5.0,
            started_at=opens[start] - timedelta(hours=1),
            end=opens[-1] + timedelta(days=1),
            history=case["history"],
            strategy_name="SMA crossover",
        )
        followed = replay(data)
        reference = replay(data, follow_signals=False)
        out["cases"][name] = {"strategy": followed, "buyHold": {key: reference[key] for key in ("equity", "fills", "cash", "shares", "costs")}}
    return out


def test_simulation_engine_version_is_pinned():
    # Bumping it changes how frozen Phase 12 records replay; that needs a migration plan first.
    assert simulation_service.ENGINE_VERSION == 1


def test_simulation_replay_matches_golden():
    _check_golden("simulation-replay-v1", _replay_payload())
