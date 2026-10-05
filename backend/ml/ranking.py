"""Walk-forward stock-ranking models (Phase 13d): a linear benchmark and one boosted tree.

Discipline (see the quant-conventions skill, "Panel ML"):
- Decision dates are split chronologically: development (training only) → validation (model and
  hyperparameter selection; every trial logged) → final holdout (untouched until the end and
  counted when used).
- At every prediction date the model is refitted on rows whose label window ended before that
  date (purged + embargo), so each date is scored by the model that was trainable then. The final
  model is never applied to earlier dates.
- Preprocessing (scaling) lives inside the pipeline and is fitted on training rows only.
- Fixed seed; identical inputs give identical predictions.
scikit-learn is imported lazily (cold starts).
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

from backend.ml.panel import Panel, training_rows

SEED = 42
ModelKind = str  # "ridge" | "hgb"
MODEL_NAMES = {"ridge": "Ridge regression (linear benchmark)", "hgb": "Gradient-boosted trees (histogram)"}
DEFAULT_CRITERIA: Dict[str, float] = {
    "validationMeanIcMin": 0.0,
    "validationIcTstatMin": 2.0,
    "holdoutExcessVsEqualWeightAtStressMin": 0.0,
    "holdoutMaxDrawdownWorseThanIndexMax": 0.10,
}


@dataclass(frozen=True)
class RankingConfig:
    horizon: int = 20
    min_train_dates: int = 36
    validation_dates: int = 24
    holdout_dates: int = 18
    embargo: int = 1
    ridge_alphas: Tuple[float, ...] = (1.0, 10.0, 100.0)
    hgb_grid: Tuple[Tuple[Tuple[str, Any], ...], ...] = (
        (("max_iter", 150), ("learning_rate", 0.05), ("max_depth", 3), ("min_samples_leaf", 50)),
        (("max_iter", 300), ("learning_rate", 0.03), ("max_depth", 4), ("min_samples_leaf", 100)),
    )
    top_n: int = 10
    hold_buffer: int = 5
    bootstrap: int = 1000
    criteria: Tuple[Tuple[str, float], ...] = tuple(DEFAULT_CRITERIA.items())

    def candidates(self) -> List[Tuple[ModelKind, Dict[str, Any]]]:
        return [("ridge", {"alpha": alpha}) for alpha in self.ridge_alphas] + [("hgb", dict(grid)) for grid in self.hgb_grid]

    def as_dict(self) -> Dict[str, Any]:
        out = asdict(self)
        out["hgb_grid"] = [dict(grid) for grid in self.hgb_grid]
        out["criteria"] = dict(self.criteria)
        return out


def make_model(kind: ModelKind, params: Dict[str, Any]):
    from sklearn.ensemble import HistGradientBoostingRegressor
    from sklearn.linear_model import Ridge
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    if kind == "ridge":
        return make_pipeline(StandardScaler(), Ridge(alpha=params["alpha"]))
    if kind == "hgb":
        return HistGradientBoostingRegressor(random_state=SEED, **params)
    raise ValueError(f"Unknown model kind: {kind}")


@dataclass
class Split:
    development: List[int]
    validation: List[int]
    holdout: List[int]


def split_dates(panel: Panel, config: RankingConfig) -> Split:
    dates = sorted(panel.frame["t"].unique().tolist())
    needed = config.min_train_dates + config.validation_dates + config.holdout_dates
    if len(dates) < needed:
        raise ValueError(f"Needs at least {needed} monthly decision dates with features; the dataset has {len(dates)}")
    holdout = dates[-config.holdout_dates :]
    validation = dates[-(config.holdout_dates + config.validation_dates) : -config.holdout_dates]
    development = dates[: -(config.holdout_dates + config.validation_dates)]
    return Split(development=development, validation=validation, holdout=holdout)


@dataclass
class WalkForward:
    predictions: Dict[int, pd.Series]  # decision session -> score per symbol
    cutoffs: Dict[int, int]  # decision session -> last label_end used in training
    train_rows: Dict[int, int]
    skipped: List[int] = field(default_factory=list)


def walk_forward(panel: Panel, kind: ModelKind, params: Dict[str, Any], prediction_ts: Sequence[int], config: RankingConfig) -> WalkForward:
    features = list(panel.features)
    frame = panel.frame
    out = WalkForward(predictions={}, cutoffs={}, train_rows={})
    for t in prediction_ts:
        train = training_rows(panel, t, config.embargo)
        if train["t"].nunique() < config.min_train_dates:
            out.skipped.append(t)
            continue
        model = make_model(kind, params)
        model.fit(train[features].to_numpy(), train["target"].to_numpy())
        today = frame[frame["t"] == t].dropna(subset=features)
        if today.empty:
            out.skipped.append(t)
            continue
        out.predictions[t] = pd.Series(model.predict(today[features].to_numpy()), index=today["symbol"].to_numpy())
        out.cutoffs[t] = int(train["label_end"].max())
        out.train_rows[t] = len(train)
    return out


def _spearman(a: np.ndarray, b: np.ndarray) -> Optional[float]:
    if len(a) < 5:
        return None
    ra = pd.Series(a).rank().to_numpy()
    rb = pd.Series(b).rank().to_numpy()
    if np.std(ra) == 0 or np.std(rb) == 0:
        return None
    return float(np.corrcoef(ra, rb)[0, 1])


def information_coefficients(panel: Panel, predictions: Dict[int, pd.Series]) -> Dict[int, float]:
    frame = panel.frame
    out: Dict[int, float] = {}
    for t, scores in predictions.items():
        rows = frame[(frame["t"] == t) & frame["target"].notna()].set_index("symbol")
        common = rows.index.intersection(scores.index)
        ic = _spearman(scores.loc[common].to_numpy(), rows.loc[common, "target"].to_numpy())
        if ic is not None:
            out[t] = ic
    return out


def ic_summary(ics: Dict[int, float]) -> Dict[str, Optional[float]]:
    values = np.array(list(ics.values()))
    if len(values) < 2:
        return {"meanIc": float(values.mean()) if len(values) else None, "icStd": None, "icTstat": None, "positiveShare": None, "dates": int(len(values))}
    std = float(values.std(ddof=1))
    mean = float(values.mean())
    return {
        "meanIc": mean,
        "icStd": std,
        "icTstat": mean / std * math.sqrt(len(values)) if std > 0 else None,
        "positiveShare": float((values > 0).mean()),
        "dates": int(len(values)),
    }


def top_decile_spread(panel: Panel, predictions: Dict[int, pd.Series]) -> Optional[float]:
    """Mean forward (universe-relative) return of the top-decile predictions, across dates."""
    frame = panel.frame
    spreads = []
    for t, scores in predictions.items():
        rows = frame[(frame["t"] == t) & frame["target"].notna()].set_index("symbol")
        common = rows.index.intersection(scores.index)
        if len(common) < 10:
            continue
        ranked = scores.loc[common].sort_values(ascending=False)
        top = ranked.index[: max(1, len(ranked) // 10)]
        spreads.append(float(rows.loc[top, "target"].mean()))
    return float(np.mean(spreads)) if spreads else None


def bootstrap_mean_ci(values: Sequence[float], draws: int, seed: int = SEED) -> Dict[str, Optional[float]]:
    """Percentile CI (5%, 95%) of the mean, resampling whole decision periods (monthly blocks)."""
    data = np.asarray([v for v in values if v is not None and np.isfinite(v)], dtype=float)
    if len(data) < 5:
        return {"low": None, "high": None, "draws": 0}
    rng = np.random.default_rng(seed)
    means = rng.choice(data, size=(draws, len(data)), replace=True).mean(axis=1)
    return {"low": float(np.percentile(means, 5)), "high": float(np.percentile(means, 95)), "draws": draws}


def select(panel: Panel, split: Split, config: RankingConfig) -> Tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]], Dict[str, WalkForward]]:
    """Every candidate is scored on the validation dates only; the best per family is kept."""
    candidates = config.candidates()
    trials: List[Dict[str, Any]] = []
    best: Dict[str, Dict[str, Any]] = {}
    best_runs: Dict[str, WalkForward] = {}
    for index, (kind, params) in enumerate(candidates, start=1):
        run = walk_forward(panel, kind, params, split.validation, config)
        summary = ic_summary(information_coefficients(panel, run.predictions))
        trial = {"index": index, "count": len(candidates), "kind": kind, "params": params} | summary
        trials.append(trial)
        score = summary["meanIc"] if summary["meanIc"] is not None else -np.inf
        if kind not in best or score > (best[kind]["meanIc"] if best[kind]["meanIc"] is not None else -np.inf):
            best[kind] = trial
            best_runs[kind] = run
    return trials, best, best_runs


def fit_final(panel: Panel, kind: ModelKind, params: Dict[str, Any], after_t: int, config: RankingConfig):
    """The forward-use model: trained on every label matured before `after_t`."""
    train = training_rows(panel, after_t, config.embargo)
    model = make_model(kind, params)
    model.fit(train[list(panel.features)].to_numpy(), train["target"].to_numpy())
    return model, train


def gate(model: Any, expected_schema: str, actual_schema: str, check_rows: np.ndarray) -> Dict[str, Any]:
    """Registry gate: the artifact must round-trip to identical predictions with the same schema."""
    from backend.ml.training import deserialize_model, serialize_model

    checks: List[Dict[str, Any]] = [{"check": "feature schema matches", "passed": expected_schema == actual_schema}]
    artifact = b""
    try:
        artifact = serialize_model(model)
        loaded = deserialize_model(artifact)
        identical = bool(np.array_equal(model.predict(check_rows), loaded.predict(check_rows)))
        checks.append({"check": "artifact reloads to identical predictions", "passed": identical})
    except Exception as exc:  # noqa: BLE001 - reported, never registered
        checks.append({"check": "artifact serialises and reloads", "passed": False, "reason": type(exc).__name__})
    return {"passed": all(check["passed"] for check in checks), "checks": checks, "artifact": artifact}


def promotion(criteria: Dict[str, float], validation: Dict[str, Any], holdout: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Prespecified criteria; 'validated' only when every one passes, holdout included."""
    results = []
    mean_ic = validation.get("meanIc")
    tstat = validation.get("icTstat")
    results.append({"criterion": f"Validation mean IC > {criteria['validationMeanIcMin']}", "value": mean_ic, "passed": mean_ic is not None and mean_ic > criteria["validationMeanIcMin"]})
    results.append({"criterion": f"Validation IC t-stat ≥ {criteria['validationIcTstatMin']}", "value": tstat, "passed": tstat is not None and tstat >= criteria["validationIcTstatMin"]})
    if holdout is None:
        results.append({"criterion": "Holdout evaluated", "value": None, "passed": False, "reason": "The holdout has not been used yet."})
    else:
        excess = holdout.get("excessVsEqualWeightAtStress")
        dd_gap = holdout.get("maxDrawdownWorseThanIndex")
        results.append({"criterion": f"Holdout return minus equal-weight baseline at stressed costs > {criteria['holdoutExcessVsEqualWeightAtStressMin']}", "value": excess, "passed": excess is not None and excess > criteria["holdoutExcessVsEqualWeightAtStressMin"]})
        results.append({"criterion": f"Holdout max drawdown no more than {criteria['holdoutMaxDrawdownWorseThanIndexMax']:.0%} worse than the index", "value": dd_gap, "passed": dd_gap is not None and dd_gap <= criteria["holdoutMaxDrawdownWorseThanIndexMax"]})
    passed = all(item["passed"] for item in results)
    return {"maturity": "validated" if passed else "research", "criteria": results, "passed": passed}
