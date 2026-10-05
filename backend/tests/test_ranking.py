"""Phase 13d: panel dataset, walk-forward ranking, holdout discipline, gate, ml-ranking runs."""

from __future__ import annotations

import asyncio

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.deps import get_store
from backend.main import app
from backend.ml import ranking
from backend.ml.panel import HORIZON, WARMUP, build_panel, features_at, schema_hash, training_rows
from backend.models.research_runs import RunSettings
from backend.research import snapshots
from backend.research.snapshots import build_snapshot
from backend.research.universe import EligibilityRules, rebalance_indices
from backend.services import rate_limiter, ranking_service

SMALL = ranking.RankingConfig(
    min_train_dates=12,
    validation_dates=8,
    holdout_dates=6,
    ridge_alphas=(10.0,),
    hgb_grid=((("max_iter", 60), ("learning_rate", 0.1), ("max_depth", 3), ("min_samples_leaf", 20)),),
    top_n=5,
    hold_buffer=2,
    bootstrap=200,
)


def _frames(n=900, symbols=25, signal=True, seed=5):
    """Each stock drifts with a slowly changing latent rate: past returns carry information about future ones."""
    rng = np.random.default_rng(seed)
    index = pd.bdate_range("2020-01-01", periods=n).tz_localize("Asia/Kolkata")
    frames = {}
    for k in range(symbols):
        drift = np.zeros(n)
        if signal:
            level = rng.normal(0, 0.002)
            for i in range(n):
                level = 0.995 * level + rng.normal(0, 0.0002)
                drift[i] = level
        returns = drift + rng.normal(0, 0.01, n)
        close = 100 * np.cumprod(1 + returns)
        open_ = np.concatenate([[close[0]], close[:-1]]) * (1 + rng.normal(0, 0.001, n))
        volume = rng.integers(500_000, 1_500_000, n).astype(float)
        frames[f"S{k:02d}.NS"] = pd.DataFrame(
            {"Open": open_, "High": np.maximum(open_, close), "Low": np.minimum(open_, close), "Close": close, "Adj Close": close, "Volume": volume, "Dividends": 0.0, "Stock Splits": 0.0},
            index=index,
        )
    bench = pd.DataFrame({"Close": 1000 * np.ones(n), "Adj Close": 1000 * np.cumprod(1 + rng.normal(0.0003, 0.008, n))}, index=index)
    return frames, bench


def _snapshot(**kwargs):
    frames, bench = _frames(**kwargs)
    return build_snapshot(frames, bench, universe="synthetic", benchmark_symbol="^TEST", source="synthetic", downloaded_at="2026-01-01T00:00:00+00:00", survivorship_biased=True, caveats=["Synthetic."])


SNAP = _snapshot()
DECISIONS = rebalance_indices(SNAP, "monthly")
PANEL = build_panel(SNAP, DECISIONS)


def test_target_is_the_executable_forward_window_relative_to_the_universe():
    t = DECISIONS[20]
    rows = PANEL.frame[PANEL.frame["t"] == t].set_index("symbol")
    opens = SNAP.arrays["open"]
    forward = opens[t + 1 + HORIZON] / opens[t + 1] - 1
    expected = forward - forward.mean()
    for j, symbol in enumerate(SNAP.symbols):
        assert rows.loc[symbol, "target"] == pytest.approx(expected[j])
    assert (rows["label_end"] == t + 1 + HORIZON).all()
    assert rows["target"].mean() == pytest.approx(0.0, abs=1e-12)  # per-date constant removed
    unlabelled = PANEL.frame[PANEL.frame["t"] + 1 + HORIZON >= SNAP.sessions]
    assert len(unlabelled) and unlabelled["target"].isna().all()  # the last month has no label yet


def test_features_ignore_the_future():
    t = DECISIONS[15]
    before = features_at(SNAP, t)
    arrays = {name: values.copy() for name, values in SNAP.arrays.items()}
    for values in arrays.values():
        values[t + 1 :] *= 7.0
    mutated = snapshots.Snapshot(**{**SNAP.__dict__, "arrays": arrays})
    after = features_at(mutated, t)
    for name in before:
        assert np.array_equal(before[name], after[name], equal_nan=True), name


def test_first_decision_waits_for_the_longest_lookback():
    assert PANEL.frame["t"].min() >= WARMUP


def test_training_rows_are_purged_and_embargoed():
    t = DECISIONS[30]
    train = training_rows(PANEL, t, embargo=1)
    assert len(train) and (train["label_end"] <= t - 1).all() and train["target"].notna().all()
    assert t not in set(train["t"])  # the decision date itself is never in its own training set
    assert not set(train["t"]) & set(range(t - HORIZON, t + 1)) or (train[train["t"] > t - HORIZON - 1].empty)


def test_walk_forward_uses_only_models_trainable_at_each_date():
    split = ranking.split_dates(PANEL, SMALL)
    run = ranking.walk_forward(PANEL, "ridge", {"alpha": 10.0}, split.validation, SMALL)
    assert run.predictions
    for t, cutoff in run.cutoffs.items():
        assert cutoff < t  # every training label had matured before the decision


def test_selection_never_touches_the_holdout():
    split = ranking.split_dates(PANEL, SMALL)
    seen = []
    original = ranking.walk_forward

    def spy(panel, kind, params, prediction_ts, config):
        seen.extend(prediction_ts)
        return original(panel, kind, params, prediction_ts, config)

    ranking.walk_forward = spy
    try:
        trials, best, _ = ranking.select(PANEL, split, SMALL)
    finally:
        ranking.walk_forward = original
    assert seen and not set(seen) & set(split.holdout)
    assert [trial["index"] for trial in trials] == [1, 2] and all(trial["count"] == 2 for trial in trials)  # every trial logged
    assert set(best) == {"ridge", "hgb"}


def test_planted_signal_is_found_and_noise_is_not():
    split = ranking.split_dates(PANEL, SMALL)
    run = ranking.walk_forward(PANEL, "ridge", {"alpha": 10.0}, split.validation + split.holdout, SMALL)
    signal_ic = ranking.ic_summary(ranking.information_coefficients(PANEL, run.predictions))
    assert signal_ic["meanIc"] > 0.1
    noise_snap = _snapshot(signal=False, seed=11)
    noise_panel = build_panel(noise_snap, rebalance_indices(noise_snap, "monthly"))
    noise_split = ranking.split_dates(noise_panel, SMALL)
    noise_run = ranking.walk_forward(noise_panel, "ridge", {"alpha": 10.0}, noise_split.validation + noise_split.holdout, SMALL)
    noise_ic = ranking.ic_summary(ranking.information_coefficients(noise_panel, noise_run.predictions))
    assert abs(noise_ic["meanIc"]) < 0.1
    verdict = ranking.promotion(dict(SMALL.criteria), noise_ic, {"excessVsEqualWeightAtStress": -0.01, "maxDrawdownWorseThanIndex": 0.0})
    assert verdict["maturity"] == "research" and not verdict["passed"]


def test_promotion_requires_the_holdout():
    verdict = ranking.promotion(dict(SMALL.criteria), {"meanIc": 0.2, "icTstat": 5.0}, None)
    assert verdict["maturity"] == "research" and any(item["criterion"] == "Holdout evaluated" and not item["passed"] for item in verdict["criteria"])
    ok = ranking.promotion(dict(SMALL.criteria), {"meanIc": 0.2, "icTstat": 5.0}, {"excessVsEqualWeightAtStress": 0.05, "maxDrawdownWorseThanIndex": 0.02})
    assert ok["maturity"] == "validated"


def test_gate_checks_schema_and_round_trip():
    model, train = ranking.fit_final(PANEL, "ridge", {"alpha": 10.0}, SNAP.sessions, SMALL)
    rows = train[list(PANEL.features)].to_numpy()[:50]
    passed = ranking.gate(model, PANEL.schema_hash, PANEL.schema_hash, rows)
    assert passed["passed"] and passed["artifact"]
    failed = ranking.gate(model, PANEL.schema_hash, schema_hash(["other"]), rows)
    assert not failed["passed"] and failed["checks"][0]["passed"] is False


def test_experiment_is_deterministic_and_keeps_the_holdout_unused_by_default():
    settings = RunSettings(datasetVersion=SNAP.version, capital=2_000_000, minMedianTradedValueInr=0, priceFloor=0)
    first, artifacts = ranking_service.run_experiment(SNAP, settings, SMALL)
    second, _ = ranking_service.run_experiment(SNAP, settings, SMALL)
    assert first["predictions"] == second["predictions"]
    assert first["holdoutUses"] == 0 and first["predictions"]["holdout"] == {} and first["holdoutTrading"] is None
    assert set(artifacts) == {"ridge", "hgb"} and all(f["final"]["gate"]["passed"] for f in first["families"].values())
    assert all(f["promotion"]["maturity"] == "research" for f in first["families"].values())  # no holdout, no promotion
    runs = first["validationTrading"]["runs"]
    assert {"ridge", "ridge@stress", "hgb", "hgb@stress", "equal-weight-universe", "xs-momentum"} <= set(runs)
    assert runs["hgb@stress"]["costs"] > runs["hgb"]["costs"]
    with_holdout, _ = ranking_service.run_experiment(SNAP, settings, SMALL, evaluate_holdout=True)
    assert with_holdout["holdoutUses"] == 1 and with_holdout["predictions"]["holdout"]["ridge"]
    validation_dates = set(with_holdout["predictions"]["validation"]["ridge"])
    assert not validation_dates & set(with_holdout["predictions"]["holdout"]["ridge"])


def test_ml_ranking_runs_through_the_api_from_stored_predictions():
    rate_limiter.reset()
    client = TestClient(app)
    signup = client.post("/api/auth/signup", json={"email": "rank-api@example.com", "password": "Tr1cky-Horse-42", "name": "R"})
    headers = {"Authorization": f"Bearer {signup.json()['token']}"}
    settings = RunSettings(datasetVersion=SNAP.version, capital=2_000_000, minMedianTradedValueInr=0, priceFloor=0)
    record, artifacts = ranking_service.run_experiment(SNAP, settings, SMALL)

    async def save():
        store = await get_store()
        await snapshots.save_snapshot(store, SNAP)
        return await store.add_ranking_experiment(record, artifacts)

    stored = asyncio.run(save())
    models = client.get("/api/research-runs/models", headers=headers).json()
    assert any(item["id"] == stored["id"] and item["families"]["hgb"]["maturity"] == "research" for item in models)
    detail = client.get(f"/api/research-runs/models/{stored['id']}", headers=headers).json()
    assert "predictions" not in detail and detail["trials"] and detail["featureFamilies"]

    body = settings.model_dump(mode="json") | {"strategy": "ml-ranking", "params": {"model": stored["id"], "family": "ridge", "holdings": 5}}
    run = client.post("/api/research-runs", headers=headers, json=body)
    assert run.status_code == 200, run.text
    data = run.json()
    first_prediction = min(record["predictions"]["validation"]["ridge"])
    assert data["period"]["start"] >= first_prediction and data["counts"]["fills"] > 0
    fills = client.get(f"/api/research-runs/{data['id']}/fills?limit=3", headers=headers).json()["items"]
    assert any("Model rank" in fill["reason"] for fill in fills)

    missing = client.post("/api/research-runs", headers=headers, json=body | {"params": {"family": "ridge"}})
    assert missing.status_code == 422
    other = client.post("/api/research-runs", headers=headers, json=body | {"params": {"model": "c" * 32}})
    assert other.status_code == 404
