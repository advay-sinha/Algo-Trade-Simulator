"""Train → evaluate → register pipeline used by the ML endpoints (blocking; run in a thread)."""

from __future__ import annotations

from typing import Any, Dict, Tuple

from backend.analytics.metrics import sanitize
from backend.ml.datasets import build_dataset
from backend.ml.evaluation import classification_report, strategy_report
from backend.ml.features import max_lookback, resolve_config
from backend.ml.training import describe, serialize_model, train_model
from backend.models.ml import TrainModelRequest
from backend.services.backtesting_service import bars_from_points
from backend.services.clock import now


def train_and_evaluate(request: TrainModelRequest, chart: Dict[str, Any]) -> Tuple[Dict[str, Any], bytes]:
    """Returns (registry record without id/userId, artifact bytes). Raises ValueError with user-facing text."""
    config = resolve_config(request.features)
    bars = bars_from_points(chart.get("points", []))
    if len(bars) < max_lookback(config) + 120:
        raise ValueError(f"Not enough history: {len(bars)} daily bars. Choose a longer range or fewer long-window features.")
    dataset = build_dataset(bars, config, request.label, request.horizon, request.testFraction, request.embargo)
    model = train_model(dataset, request.model)
    artifact = serialize_model(model)
    name, hyperparams = describe(request.model)
    classification = classification_report(model, dataset)
    strategy = strategy_report(model, dataset, bars, request.costBps, request.slippageBps)

    record = {
        "symbol": request.symbol.upper(),
        "modelType": request.model,
        "modelName": name,
        "hyperparams": hyperparams,
        "featureConfig": config,
        "featureNames": list(dataset.features.columns),
        "label": {"kind": request.label, "horizon": request.horizon},
        "range": request.range,
        "split": dataset.boundaries(),
        "labelDistribution": dataset.distribution(),
        "classification": classification,
        "strategy": strategy,
        "artifactBytes": len(artifact),
        "dataSource": chart.get("source", "live"),
        "trainedAt": now().isoformat(),
    }
    return sanitize(record), artifact


def tracking_payload(record: Dict[str, Any]) -> Tuple[str, Dict[str, Any], Dict[str, Any], Dict[str, str]]:
    classification = record["classification"]
    strategy = record["strategy"]
    params = {
        "symbol": record["symbol"],
        "model": record["modelType"],
        "label": record["label"]["kind"],
        "horizon": record["label"]["horizon"],
        "range": record["range"],
        "features": ",".join(record["featureConfig"]),
        "train_rows": record["split"]["trainRows"],
        "test_rows": record["split"]["testRows"],
        "embargo_bars": record["split"]["embargoBars"],
    } | {f"hp_{key}": value for key, value in record["hyperparams"].items()}
    metrics = {
        "accuracy": classification.get("accuracy"),
        "baseline_accuracy": classification.get("baselineAccuracy"),
        "f1": classification.get("f1"),
        "roc_auc": classification.get("rocAuc"),
        "strategy_return": strategy["summary"].get("totalReturn"),
        "buy_hold_return": strategy["summary"].get("buyHoldReturn"),
        "strategy_sharpe": strategy["metrics"].get("sharpe"),
        "strategy_max_drawdown": strategy["metrics"].get("maxDrawdown"),
    }
    tags = {"source": "algo-trade-lab", "data_source": str(record.get("dataSource"))}
    return f"{record['symbol']}-{record['modelType']}", params, metrics, tags
