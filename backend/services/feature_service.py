"""Dataset previews for the API: build features + labels + split, summarize without storing."""

from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd

from backend.analytics.metrics import sanitize
from backend.ml.datasets import LABEL_NAMES, Dataset, build_dataset
from backend.ml.features import max_lookback, resolve_config
from backend.models.ml import FeaturesRequest
from backend.services.backtesting_service import bars_from_points

PREVIEW_ROWS = 5


def _rows(dataset: Dataset, frame: pd.DataFrame) -> List[Dict[str, Any]]:
    return [
        {"timestamp": ts.isoformat(), "label": int(dataset.labels.loc[ts]), "values": {name: float(value) for name, value in row.items()}}
        for ts, row in frame.iterrows()
    ]


def preview_dataset(request: FeaturesRequest, chart: Dict[str, Any]) -> Dict[str, Any]:
    """Raises ValueError with a user-facing message for invalid configs or too little history."""
    config = resolve_config(request.features)
    bars = bars_from_points(chart.get("points", []))
    if len(bars) < max_lookback(config) + 60:
        raise ValueError(
            f"Not enough history: {len(bars)} daily bars for features needing about {max_lookback(config)} bars of warm-up. Choose a longer range."
        )
    dataset = build_dataset(bars, config, request.label, request.horizon, request.testFraction, request.embargo)
    train = dataset.X_train
    stats = {
        name: {"mean": float(train[name].mean()), "std": float(train[name].std(ddof=1)), "min": float(train[name].min()), "max": float(train[name].max())}
        for name in dataset.features.columns
    }
    return sanitize(
        {
            "symbol": request.symbol.upper(),
            "range": request.range,
            "dataSource": chart.get("source", "live"),
            "featureConfig": config,
            "featureNames": list(dataset.features.columns),
            "shape": {"rows": len(dataset.features), "columns": dataset.features.shape[1]},
            "inputBars": len(bars),
            "droppedRows": dataset.dropped_rows,
            "label": {"kind": request.label, "horizon": request.horizon, "names": LABEL_NAMES[request.label]},
            "split": dataset.boundaries(),
            "labelDistribution": dataset.distribution(),
            "trainStats": stats,
            "head": _rows(dataset, dataset.features.head(PREVIEW_ROWS)),
            "tail": _rows(dataset, dataset.features.tail(PREVIEW_ROWS)),
        }
    )
