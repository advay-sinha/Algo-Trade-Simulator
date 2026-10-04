"""Feature pipeline: no lookahead, NaN policy, config handling, and split discipline."""

import numpy as np
import pandas as pd

from backend.ml.datasets import build_dataset, make_labels
from backend.ml.features import DEFAULT_FEATURE_CONFIG, FEATURES, build_features, resolve_config
from backend.tests.helpers import make_bars


def test_truncation_reproduces_overlapping_rows():
    """Recomputing features on truncated history must give identical rows for the overlap."""
    bars = make_bars(400)
    full = build_features(bars, DEFAULT_FEATURE_CONFIG)
    for cut in (150, 260, 399):
        truncated = build_features(bars.iloc[:cut], DEFAULT_FEATURE_CONFIG)
        pd.testing.assert_frame_equal(truncated, full.iloc[:cut], check_exact=False, rtol=1e-10, atol=1e-12)


def test_future_prices_do_not_change_past_features():
    bars = make_bars(400)
    mutated = bars.copy()
    mutated.iloc[300:, :] *= 1.7
    before = build_features(bars, DEFAULT_FEATURE_CONFIG).iloc[:300]
    after = build_features(mutated, DEFAULT_FEATURE_CONFIG).iloc[:300]
    pd.testing.assert_frame_equal(before, after)


def test_every_feature_group_is_leak_free_individually():
    bars = make_bars(300)
    mutated = bars.copy()
    mutated.iloc[200:, :] *= 0.5
    for name, spec in FEATURES.items():
        config = {name: dict(spec.defaults)}
        a = build_features(bars, config).iloc[:200]
        b = build_features(mutated, config).iloc[:200]
        pd.testing.assert_frame_equal(a, b, obj=name)


def test_labels_use_only_future_data():
    bars = make_bars(200)
    labels = make_labels(bars, "direction", horizon=1)
    mutated = bars.copy()
    mutated.iloc[101, mutated.columns.get_loc("close")] *= 1.5  # only bar 101 changes
    changed = make_labels(mutated, "direction", horizon=1)
    # Label at 100 looks at close[101] -> may change; labels before 100 must not.
    pd.testing.assert_series_equal(labels.iloc[:100], changed.iloc[:100])
    assert labels.iloc[100] != changed.iloc[100] or labels.iloc[100] == 1.0


def test_last_horizon_labels_are_unknown_not_filled():
    bars = make_bars(120)
    for horizon in (1, 5):
        labels = make_labels(bars, "direction", horizon=horizon)
        assert labels.iloc[-horizon:].isna().all()
        assert labels.iloc[:-horizon].notna().all()


def test_dataset_has_no_nans_and_drops_once():
    bars = make_bars(400)
    dataset = build_dataset(bars, DEFAULT_FEATURE_CONFIG, "direction", horizon=1)
    assert not dataset.features.isna().any().any()
    assert not dataset.labels.isna().any()
    assert dataset.dropped_rows == len(bars) - len(dataset.features)
    assert set(dataset.labels.unique()) <= {0, 1}


def test_split_is_time_ordered_with_embargo():
    bars = make_bars(400)
    for horizon, embargo in ((1, 1), (5, 1), (1, 3)):
        dataset = build_dataset(bars, DEFAULT_FEATURE_CONFIG, "direction", horizon=horizon, embargo=embargo)
        assert dataset.train_index.max() < dataset.test_index.min()
        index = list(dataset.features.index)
        gap = index.index(dataset.test_index[0]) - index.index(dataset.train_index[-1]) - 1
        assert gap == dataset.embargo_bars == max(horizon, embargo, 1)
        assert dataset.train_index.is_monotonic_increasing and dataset.test_index.is_monotonic_increasing
        assert len(set(dataset.train_index) & set(dataset.test_index)) == 0


def test_train_and_test_cannot_overlap_even_with_tiny_data():
    bars = make_bars(90)
    try:
        build_dataset(bars, DEFAULT_FEATURE_CONFIG, "direction")
    except ValueError as exc:
        assert "Not enough complete rows" in str(exc)
    else:
        raise AssertionError("expected a ValueError for insufficient rows")


def test_label_distribution_reports_all_classes():
    bars = make_bars(400)
    dataset = build_dataset(bars, DEFAULT_FEATURE_CONFIG, "return_bucket", horizon=1)
    distribution = dataset.distribution()
    for part in ("train", "test", "all"):
        assert [row["label"] for row in distribution[part]] == [0, 1, 2]
        assert abs(sum(row["share"] for row in distribution[part]) - 1) < 1e-9
    assert sum(row["count"] for row in distribution["all"]) == len(dataset.labels)


def test_volatility_regime_labels_are_binary_and_future_based():
    bars = make_bars(500)
    dataset = build_dataset(bars, {"volatility": {"windows": [20]}}, "volatility_regime", horizon=10)
    assert set(dataset.labels.unique()) <= {0, 1}
    assert dataset.embargo_bars >= 10


def test_config_is_serializable_and_validated():
    config = resolve_config({"rsi": {"period": 7}, "momentum": {}})
    assert config == {"rsi": {"period": 7}, "momentum": {"windows": [5, 10, 20]}}
    import json

    assert json.loads(json.dumps(config)) == config
    for bad in ({"nope": {}}, {"rsi": {"length": 3}}, {}):
        try:
            resolve_config(bad)
        except ValueError:
            continue
        raise AssertionError(f"expected ValueError for {bad}")


def test_rsi_stays_in_range_and_macd_is_scaled():
    bars = make_bars(300)
    features = build_features(bars, {"rsi": {"period": 14}, "macd": {"fast": 12, "slow": 26, "signal": 9}}).dropna()
    assert features["rsi_14"].between(0, 100).all()
    assert features["macd"].abs().max() < 0.5  # price-scaled, not raw dollars
    assert np.isfinite(features.to_numpy()).all()
