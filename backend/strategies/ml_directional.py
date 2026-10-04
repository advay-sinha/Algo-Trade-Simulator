"""Adapter that lets a trained ML model act like any other strategy: bars in, long/flat out.

Not part of the parameter-driven registry (it needs a fitted model), but it follows the same
contract: the signal at bar t uses features computed from data up to t only.
"""

from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd

from backend.ml.evaluation import signals_from_predictions
from backend.ml.features import build_features


class MlDirectionalStrategy:
    id = "ml-directional"
    name = "ML directional model"

    def __init__(self, model: Any, feature_config: Dict[str, Dict[str, Any]], feature_names: List[str], label_kind: str) -> None:
        self.model = model
        self.feature_config = feature_config
        self.feature_names = feature_names
        self.label_kind = label_kind

    def generate_signals(self, bars: pd.DataFrame) -> pd.Series:
        features = build_features(bars, self.feature_config)[self.feature_names]
        complete = features.dropna()
        signals = pd.Series(0, index=bars.index, dtype=int)  # flat until features are warmed up
        if not complete.empty:
            predictions = self.model.predict(complete)
            signals.loc[complete.index] = signals_from_predictions(predictions, self.label_kind)
        return signals
