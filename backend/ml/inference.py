"""Live signals from a registered model: rebuild features with the model's stored config on the
latest bars and predict on the newest complete row."""

from __future__ import annotations

from typing import Any, Dict

import pandas as pd

from backend.analytics.metrics import sanitize
from backend.ml.datasets import LABEL_NAMES
from backend.ml.evaluation import signals_from_predictions
from backend.ml.features import build_features
from backend.ml.training import deserialize_model


def predict_latest(record: Dict[str, Any], artifact: bytes, bars: pd.DataFrame) -> Dict[str, Any]:
    model = deserialize_model(artifact)
    features = build_features(bars, record["featureConfig"]).dropna()
    if features.empty:
        raise ValueError("Not enough recent history to compute the model's features")
    expected = record["featureNames"]
    missing = [name for name in expected if name not in features.columns]
    if missing:
        raise ValueError(f"Recent data is missing features the model needs: {', '.join(missing[:5])}")
    latest = features[expected].iloc[[-1]]
    predicted = int(model.predict(latest)[0])
    probabilities = {}
    if hasattr(model, "predict_proba"):
        for cls, probability in zip(model.classes_, model.predict_proba(latest)[0]):
            probabilities[LABEL_NAMES[record["label"]["kind"]][int(cls)]] = float(probability)
    signal = "buy" if signals_from_predictions(pd.Series([predicted]).to_numpy(), record["label"]["kind"])[0] == 1 else "flat"
    return sanitize(
        {
            "modelId": record["id"],
            "modelType": record["modelType"],
            "trainedAt": record["trainedAt"],
            "symbol": record["symbol"],
            "asOf": latest.index[-1].isoformat(),
            "prediction": predicted,
            "predictionName": LABEL_NAMES[record["label"]["kind"]][predicted],
            "probabilities": probabilities,
            "signal": signal,
            "rule": record.get("strategy", {}).get("rule"),
        }
    )
