"""Honest evaluation: classification metrics next to a majority-class baseline and a cost-aware
backtest of the model's signals vs buy-and-hold over the same (unseen) test window."""

from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import pandas as pd

from backend.analytics.metrics import sanitize
from backend.analytics.risk import build_risk_report
from backend.ml.datasets import LABEL_NAMES, Dataset
from backend.services.backtesting_service import BacktestConfig, run_backtest


def signals_from_predictions(predictions: np.ndarray, label_kind: str) -> np.ndarray:
    """Map class predictions to long (1) / flat (0)."""
    if label_kind == "direction":
        return (predictions == 1).astype(int)
    if label_kind == "return_bucket":
        return (predictions == 2).astype(int)
    if label_kind == "volatility_regime":
        return (predictions == 0).astype(int)  # stay invested when a calmer regime is expected
    raise ValueError(f"Unknown label kind: {label_kind}")


SIGNAL_RULE = {
    "direction": "Long when the model predicts the next move is up; otherwise flat.",
    "return_bucket": "Long when the model predicts the up bucket; otherwise flat.",
    "volatility_regime": "Long when the model predicts a calmer regime; flat when it predicts higher volatility.",
}


def classification_report(model, dataset: Dataset) -> Dict[str, Any]:
    from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score

    X_test, y_test = dataset.X_test, dataset.y_test
    predictions = model.predict(X_test)
    classes = sorted(LABEL_NAMES[dataset.label_kind])
    binary = len(classes) == 2
    average = "binary" if binary else "macro"
    majority_class = int(dataset.y_train.value_counts().idxmax())
    baseline = float((y_test == majority_class).mean())

    roc_auc = None
    roc_reason = None
    if y_test.nunique() < 2:
        roc_reason = "Test window has only one label class"
    elif hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(X_test)
        if binary:
            roc_auc = float(roc_auc_score(y_test, probabilities[:, list(model.classes_).index(1)]))
        else:
            # Align probability columns to every class (a class may be missing from training).
            full = np.zeros((len(X_test), len(classes)))
            for column, cls in enumerate(model.classes_):
                full[:, classes.index(int(cls))] = probabilities[:, column]
            try:
                roc_auc = float(roc_auc_score(y_test, full, multi_class="ovr", average="macro", labels=classes))
            except ValueError as exc:
                roc_reason = str(exc)

    per_class: List[Dict[str, Any]] = []
    precision = precision_score(y_test, predictions, labels=classes, average=None, zero_division=0)
    recall = recall_score(y_test, predictions, labels=classes, average=None, zero_division=0)
    f1 = f1_score(y_test, predictions, labels=classes, average=None, zero_division=0)
    for index, cls in enumerate(classes):
        per_class.append(
            {
                "label": cls,
                "name": LABEL_NAMES[dataset.label_kind][cls],
                "precision": float(precision[index]),
                "recall": float(recall[index]),
                "f1": float(f1[index]),
                "support": int((y_test == cls).sum()),
            }
        )
    positive = {"pos_label": 1} if binary else {}
    return sanitize(
        {
            "accuracy": float(accuracy_score(y_test, predictions)),
            "baselineAccuracy": baseline,
            "baselineClass": majority_class,
            "beatsBaseline": float(accuracy_score(y_test, predictions)) > baseline,
            "precision": float(precision_score(y_test, predictions, average=average, zero_division=0, **positive)),
            "recall": float(recall_score(y_test, predictions, average=average, zero_division=0, **positive)),
            "f1": float(f1_score(y_test, predictions, average=average, zero_division=0, **positive)),
            "rocAuc": roc_auc,
            "rocAucReason": roc_reason,
            "averaging": average,
            "confusionMatrix": {
                "labels": [LABEL_NAMES[dataset.label_kind][cls] for cls in classes],
                "matrix": confusion_matrix(y_test, predictions, labels=classes).tolist(),
            },
            "perClass": per_class,
            "testRows": int(len(y_test)),
        }
    )


def strategy_report(model, dataset: Dataset, bars: pd.DataFrame, cost_bps: float = 5.0, slippage_bps: float = 5.0) -> Dict[str, Any]:
    """Backtest the model's test-window signals with costs, vs buy-and-hold of the same window."""
    predictions = model.predict(dataset.X_test)
    signals = pd.Series(signals_from_predictions(np.asarray(predictions), dataset.label_kind), index=dataset.test_index)
    window = bars.loc[dataset.test_index[0] : dataset.test_index[-1]]
    result = run_backtest(window, signals.reindex(window.index).fillna(0).astype(int), BacktestConfig(100_000, cost_bps, slippage_bps))
    series = result.pop("_series")
    risk = build_risk_report(series["equity"], series["buyHold"], result["trades"], "buy-and-hold", None, None, 0.0)
    risk.pop("benchmarkEquity", None)
    return sanitize(
        {
            "rule": SIGNAL_RULE[dataset.label_kind],
            "costs": {"costBps": cost_bps, "slippageBps": slippage_bps},
            "period": result["period"],
            "summary": result["summary"],
            "metrics": risk["metrics"],
            "unavailable": risk["unavailable"],
            "buyHoldMetrics": risk["buyHold"]["metrics"],
            "equity": result["equity"],
            "buyHold": result["buyHold"],
            "trades": result["trades"],
        }
    )
