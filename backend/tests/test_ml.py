"""ML pipeline: deterministic training, honest evaluation, artifact + registry round trips."""

import asyncio

import numpy as np
import pandas as pd

from backend.ml.datasets import build_dataset
from backend.ml.evaluation import classification_report, signals_from_predictions, strategy_report
from backend.ml.features import DEFAULT_FEATURE_CONFIG
from backend.ml.inference import predict_latest
from backend.ml.training import deserialize_model, serialize_model, train_model
from backend.strategies.ml_directional import MlDirectionalStrategy
from backend.tests.helpers import make_bars

BARS = make_bars(700, seed=5)
DATASET = build_dataset(BARS, DEFAULT_FEATURE_CONFIG, "direction", horizon=1, test_fraction=0.25)


def test_training_is_deterministic_for_every_model_type():
    for model_type in ("logistic", "random_forest", "gradient_boosting"):
        a = train_model(DATASET, model_type).predict(DATASET.X_test)
        b = train_model(DATASET, model_type).predict(DATASET.X_test)
        assert np.array_equal(a, b), model_type


def test_model_never_sees_test_rows():
    assert DATASET.train_index.max() < DATASET.test_index.min()
    assert not set(DATASET.train_index) & set(DATASET.test_index)


def test_single_class_training_window_is_rejected():
    flat = DATASET
    original = flat.labels.copy()
    flat.labels.loc[flat.train_index] = 1
    try:
        train_model(flat, "logistic")
    except ValueError as exc:
        assert "only one label class" in str(exc)
    else:
        raise AssertionError("expected ValueError")
    finally:
        flat.labels.loc[:] = original


def test_artifact_round_trip_preserves_predictions():
    model = train_model(DATASET, "random_forest")
    data = serialize_model(model)
    assert 0 < len(data) < 10 * 1024 * 1024
    restored = deserialize_model(data)
    assert np.array_equal(model.predict(DATASET.X_test), restored.predict(DATASET.X_test))


def test_classification_report_includes_baseline_and_confusion_matrix():
    model = train_model(DATASET, "logistic")
    report = classification_report(model, DATASET)
    majority = DATASET.y_train.value_counts().idxmax()
    assert abs(report["baselineAccuracy"] - (DATASET.y_test == majority).mean()) < 1e-12
    matrix = np.array(report["confusionMatrix"]["matrix"])
    assert matrix.sum() == len(DATASET.y_test) == report["testRows"]
    assert 0 <= report["accuracy"] <= 1
    assert report["rocAuc"] is None or 0 <= report["rocAuc"] <= 1


def test_strategy_report_backtests_only_the_test_window():
    model = train_model(DATASET, "logistic")
    report = strategy_report(model, DATASET, BARS)
    assert report["period"]["start"] == DATASET.test_index[0].isoformat()
    assert report["period"]["end"] == DATASET.test_index[-1].isoformat()
    assert "buyHoldReturn" in report["summary"]


def test_signal_mapping_per_label_kind():
    predictions = np.array([0, 1, 2, 1, 0])
    assert signals_from_predictions(predictions, "direction").tolist() == [0, 1, 0, 1, 0]
    assert signals_from_predictions(predictions, "return_bucket").tolist() == [0, 0, 1, 0, 0]
    assert signals_from_predictions(predictions, "volatility_regime").tolist() == [1, 0, 0, 0, 1]


def test_ml_strategy_adapter_matches_direct_predictions():
    model = train_model(DATASET, "gradient_boosting")
    adapter = MlDirectionalStrategy(model, DEFAULT_FEATURE_CONFIG, list(DATASET.features.columns), "direction")
    signals = adapter.generate_signals(BARS)
    direct = signals_from_predictions(model.predict(DATASET.X_test), "direction")
    assert signals.loc[DATASET.test_index].tolist() == direct.tolist()
    assert set(signals.unique()) <= {0, 1}


def test_inference_uses_stored_feature_config():
    model = train_model(DATASET, "logistic")
    record = {
        "id": "m1",
        "modelType": "logistic",
        "trainedAt": "2026-01-01T00:00:00+00:00",
        "symbol": "TEST",
        "featureConfig": DEFAULT_FEATURE_CONFIG,
        "featureNames": list(DATASET.features.columns),
        "label": {"kind": "direction", "horizon": 1},
        "strategy": {"rule": "x"},
    }
    result = predict_latest(record, serialize_model(model), BARS)
    assert result["modelId"] == "m1" and result["signal"] in ("buy", "flat")
    assert abs(sum(result["probabilities"].values()) - 1) < 1e-9


def test_in_memory_registry_round_trip_and_isolation():
    from backend.main import InMemoryStore

    async def scenario():
        store = InMemoryStore()
        model = train_model(DATASET, "logistic")
        record = {"symbol": "TEST", "modelType": "logistic", "trainedAt": "2026-01-01T00:00:00+00:00", "classification": {}, "strategy": {}}
        first = await store.add_model("alice", record, serialize_model(model))
        second = await store.add_model("alice", record | {"trainedAt": "2026-02-01T00:00:00+00:00"}, serialize_model(model))
        listed = await store.list_models("alice")
        assert [item["id"] for item in listed] == [second["id"], first["id"]]  # retraining adds an entry
        assert await store.get_model("bob", first["id"]) is None  # other users can't see it
        latest = await store.latest_model("alice", "test")
        assert latest["id"] == second["id"]
        artifact = await store.get_artifact(latest)
        assert np.array_equal(deserialize_model(artifact).predict(DATASET.X_test), model.predict(DATASET.X_test))

    asyncio.run(scenario())
