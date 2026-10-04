"""Risk metrics against independent calculations and known series."""

import json
import math

import numpy as np
import pandas as pd

from backend.analytics import metrics as M
from backend.analytics.risk import build_risk_report

RNG = np.random.default_rng(7)
INDEX = pd.date_range("2024-01-01", periods=260, freq="B", tz="UTC")
RETURNS = RNG.normal(0.0006, 0.012, len(INDEX) - 1)
EQUITY = pd.Series(100_000 * np.concatenate([[1], np.cumprod(1 + RETURNS)]), index=INDEX)
R = EQUITY.pct_change().dropna()


def test_sharpe_matches_definition():
    value, _ = M.sharpe(R, 252, 0.0)
    assert math.isclose(value, R.mean() / R.std(ddof=1) * math.sqrt(252), rel_tol=1e-12)
    rf_p = 1.04 ** (1 / 252) - 1
    value_rf, _ = M.sharpe(R, 252, 0.04)
    assert math.isclose(value_rf, (R - rf_p).mean() / R.std(ddof=1) * math.sqrt(252), rel_tol=1e-12)


def test_sortino_volatility_cagr_match_definitions():
    sortino, _ = M.sortino(R, 252)
    assert math.isclose(sortino, R.mean() / R[R < 0].std(ddof=1) * math.sqrt(252), rel_tol=1e-12)
    vol, _ = M.volatility(R, 252)
    assert math.isclose(vol, R.std(ddof=1) * math.sqrt(252), rel_tol=1e-12)
    cagr, _ = M.cagr(EQUITY, 252)
    assert math.isclose(cagr, (EQUITY.iloc[-1] / EQUITY.iloc[0]) ** (252 / (len(EQUITY) - 1)) - 1, rel_tol=1e-12)


def test_known_drawdown_episode():
    series = pd.Series([100.0, 120.0, 90.0, 130.0], index=INDEX[:4])
    profile = M.drawdown_profile(series)
    assert math.isclose(profile["maxDrawdown"], 0.25)
    assert profile["durationBars"] == 2 and profile["recovered"]


def test_flat_and_short_series_return_null_with_reason():
    flat = pd.Series(100.0, index=INDEX)
    value, reason = M.sharpe(flat.pct_change().dropna(), 252)
    assert value is None and reason
    value, reason = M.sharpe(EQUITY.iloc[:5].pct_change().dropna(), 252)
    assert value is None and "at least" in reason


def test_trade_metrics_use_closed_trades_only():
    trades = [{"pnl": 100, "open": False}, {"pnl": -50, "open": False}, {"pnl": 30, "open": False}, {"pnl": 999, "open": True}]
    assert math.isclose(M.win_rate(trades)[0], 2 / 3)
    assert math.isclose(M.profit_factor(trades)[0], 130 / 50)
    assert M.profit_factor([{"pnl": 5, "open": False}])[0] is None
    assert M.win_rate([])[0] is None


def test_beta_alpha_against_known_relationships():
    same = M.beta_alpha(R, R, 252)
    assert math.isclose(same["beta"][0], 1.0, rel_tol=1e-9) and abs(same["alpha"][0]) < 1e-12
    double = M.beta_alpha(2 * R, R, 252)
    assert math.isclose(double["beta"][0], 2.0, rel_tol=1e-9)


def test_report_never_serializes_nan():
    flat = pd.Series(100_000.0, index=INDEX)
    report = build_risk_report(flat, flat, [], "SPY", None, None, 0.0)
    json.dumps(report, allow_nan=False)
    assert report["metrics"]["sharpe"] is None and "sharpe" in report["unavailable"]
    assert report["benchmark"]["available"] is False


def test_self_benchmark_report_has_unit_beta():
    report = build_risk_report(EQUITY, EQUITY, [], "SELF", EQUITY, "live", 0.0)
    assert math.isclose(report["comparison"]["beta"], 1.0, rel_tol=1e-9)
    assert abs(report["comparison"]["alpha"]) < 1e-12
