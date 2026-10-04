"""Model-ready datasets: features + forward-looking labels + a time-ordered split.

Rules (see the project's quant conventions):
- Features at t use data <= t; labels at t use data > t only.
- Split by date: train first, then an embargo gap of >= max(1, horizon) bars, then test.
  Never shuffled.
- NaN policy: build everything, then drop incomplete rows once at the end (leading
  warm-up rows and the trailing rows whose future isn't known yet). Labels are never filled.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal

import numpy as np
import pandas as pd

from backend.ml.features import build_features

LabelKind = Literal["direction", "return_bucket", "volatility_regime"]

LABEL_NAMES: Dict[str, Dict[int, str]] = {
    "direction": {0: "Down or flat", 1: "Up"},
    "return_bucket": {0: "Down", 1: "Flat", 2: "Up"},
    "volatility_regime": {0: "Calmer", 1: "More volatile"},
}


def make_labels(bars: pd.DataFrame, kind: LabelKind, horizon: int = 1, bucket_threshold: float = 0.005) -> pd.Series:
    close = bars["close"]
    forward_return = close.shift(-horizon) / close - 1  # uses closes after t only
    if kind == "direction":
        label = (forward_return > 0).astype(float)
    elif kind == "return_bucket":
        label = pd.Series(np.where(forward_return > bucket_threshold, 2.0, np.where(forward_return < -bucket_threshold, 0.0, 1.0)), index=bars.index)
    elif kind == "volatility_regime":
        daily = close.pct_change()
        # Future realized vol over (t, t+h] vs the median of trailing vol known at t.
        future_vol = daily[::-1].rolling(max(horizon, 2), min_periods=max(horizon, 2)).std(ddof=1)[::-1].shift(-1)
        trailing_vol = daily.rolling(20, min_periods=20).std(ddof=1)
        threshold = trailing_vol.rolling(252, min_periods=60).median()
        label = (future_vol > threshold).astype(float).where(threshold.notna() & future_vol.notna())
    else:  # pragma: no cover - guarded by the Literal type
        raise ValueError(f"Unknown label kind: {kind}")
    # Rows whose future isn't fully observed stay NaN (and get dropped), never filled.
    return label.where(forward_return.notna() if kind != "volatility_regime" else label.notna())


@dataclass
class Dataset:
    features: pd.DataFrame
    labels: pd.Series
    train_index: pd.DatetimeIndex
    test_index: pd.DatetimeIndex
    embargo_bars: int
    feature_config: Dict[str, Dict[str, Any]]
    label_kind: LabelKind
    horizon: int
    dropped_rows: int = 0
    meta: Dict[str, Any] = field(default_factory=dict)

    @property
    def X_train(self) -> pd.DataFrame:
        return self.features.loc[self.train_index]

    @property
    def y_train(self) -> pd.Series:
        return self.labels.loc[self.train_index]

    @property
    def X_test(self) -> pd.DataFrame:
        return self.features.loc[self.test_index]

    @property
    def y_test(self) -> pd.Series:
        return self.labels.loc[self.test_index]

    def boundaries(self) -> Dict[str, Any]:
        def iso(index: pd.DatetimeIndex, position: int) -> str | None:
            return index[position].isoformat() if len(index) else None

        return {
            "trainStart": iso(self.train_index, 0),
            "trainEnd": iso(self.train_index, -1),
            "testStart": iso(self.test_index, 0),
            "testEnd": iso(self.test_index, -1),
            "trainRows": len(self.train_index),
            "testRows": len(self.test_index),
            "embargoBars": self.embargo_bars,
        }

    def distribution(self) -> Dict[str, Any]:
        names = LABEL_NAMES[self.label_kind]

        def counts(series: pd.Series) -> List[Dict[str, Any]]:
            total = len(series)
            return [
                {"label": int(value), "name": names[int(value)], "count": int((series == value).sum()), "share": float((series == value).sum() / total) if total else 0.0}
                for value in sorted(names)
            ]

        return {"train": counts(self.y_train), "test": counts(self.y_test), "all": counts(self.labels)}


def build_dataset(
    bars: pd.DataFrame,
    feature_config: Dict[str, Dict[str, Any]],
    label_kind: LabelKind = "direction",
    horizon: int = 1,
    test_fraction: float = 0.25,
    embargo: int = 1,
) -> Dataset:
    if not 0.05 <= test_fraction <= 0.5:
        raise ValueError("test_fraction must be between 0.05 and 0.5")
    features = build_features(bars, feature_config)
    labels = make_labels(bars, label_kind, horizon)
    joined = features.assign(__label__=labels)
    complete = joined.dropna()  # single NaN drop, after everything is built
    dropped = len(joined) - len(complete)
    features, labels = complete.drop(columns="__label__"), complete["__label__"].astype(int)

    # Overlapping forward windows need at least `horizon` bars between train and test.
    embargo_bars = max(int(embargo), int(horizon), 1)
    n = len(features)
    test_rows = int(round(n * test_fraction))
    train_rows = n - test_rows - embargo_bars
    if train_rows < 30 or test_rows < 10:
        raise ValueError(f"Not enough complete rows ({n}) for a train/test split; choose a longer range or fewer long-window features")
    index = features.index
    train_index = index[:train_rows]
    test_index = index[train_rows + embargo_bars :]
    return Dataset(
        features=features,
        labels=labels,
        train_index=train_index,
        test_index=test_index,
        embargo_bars=embargo_bars,
        feature_config=feature_config,
        label_kind=label_kind,
        horizon=horizon,
        dropped_rows=dropped,
    )
