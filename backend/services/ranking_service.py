"""ML ranking experiments (Phase 13d): panel → walk-forward selection → (optional) holdout →
trading evaluation through the shared engine → prespecified promotion → registry gate.

Training is blocking and runs outside request handling (scripts/research/train_ranking.py). The
API only reads stored experiments and runs the `ml-ranking` strategy from their stored
walk-forward predictions.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from backend.analytics.metrics import sanitize
from backend.ml import ranking
from backend.ml.panel import FAMILY_DESCRIPTIONS, NUMERIC_FAMILIES, WARMUP, build_panel
from backend.models.research_runs import RunSettings, StrategySpec
from backend.research.snapshots import Snapshot
from backend.research.universe import EligibilityRules, rebalance_indices
from backend.services import research_runs
from backend.services.build_info import code_version
from backend.services.clock import now

logger = logging.getLogger("algo_trade_backend.ranking")
COMPARISON_STRATEGIES = ("equal-weight-universe", "xs-momentum")


def _predictions_payload(snapshot: Snapshot, predictions: Dict[int, pd.Series]) -> Dict[str, List[Tuple[str, float]]]:
    return {snapshot.dates[t].isoformat(): sorted(((symbol, float(score)) for symbol, score in series.items()), key=lambda item: item[0]) for t, series in sorted(predictions.items())}


def _period_returns(record: Dict[str, Any], dates: List[str]) -> pd.Series:
    equity = pd.Series({p["timestamp"][:10]: p["value"] for p in record["series"]["equity"]})
    marks = equity.reindex([d for d in dates if d in equity.index]).dropna()
    return marks.pct_change().dropna()


def evaluate_window(
    snapshot: Snapshot,
    settings: RunSettings,
    window_ts: List[int],
    predictions: Dict[str, Dict[str, List[Tuple[str, float]]]],
    config: ranking.RankingConfig,
    stress: float = 2.0,
) -> Dict[str, Any]:
    """Trade every model's predictions over one window next to the baselines, same settings."""
    start = snapshot.dates[window_ts[0]].isoformat()
    end = snapshot.dates[min(window_ts[-1] + config.horizon + 1, snapshot.sessions - 1)].isoformat()
    window = RunSettings(**(settings.model_dump() | {"start": start, "end": end}))
    runs: Dict[str, Dict[str, Any]] = {}
    for family, payload in predictions.items():
        spec = StrategySpec(strategy="ml-ranking", params={"family": family, "holdings": config.top_n, "holdBuffer": config.hold_buffer, "model": "0" * 32})
        extras = {"ml-ranking": {"predictions": payload}}
        runs[family] = research_runs.execute(snapshot, window, spec, extras=extras)
        runs[f"{family}@stress"] = research_runs.execute(snapshot, window, spec, extras=extras, cost_multiplier=stress)
    for strategy_id in COMPARISON_STRATEGIES:
        runs[strategy_id] = research_runs.execute(snapshot, window, StrategySpec(strategy=strategy_id))
    decision_dates = [snapshot.dates[t].isoformat() for t in window_ts]
    baseline = _period_returns(runs["equal-weight-universe"], decision_dates)
    out: Dict[str, Any] = {"start": start, "end": end, "runs": {}}
    index_dd = runs["equal-weight-universe"]["benchmark"].get("metrics", {}).get("maxDrawdown")
    for key, record in runs.items():
        periods = _period_returns(record, decision_dates)
        excess = (periods - baseline.reindex(periods.index)).dropna()
        out["runs"][key] = {
            "label": record["label"],
            "metrics": record["metrics"],
            "turnover": record["summary"]["annualTurnover"],
            "costs": record["summary"]["totalCosts"],
            "excessVsEqualWeight": (record["metrics"].get("totalReturn") or 0) - (runs["equal-weight-universe"]["metrics"].get("totalReturn") or 0),
            "monthlyExcessCi": ranking.bootstrap_mean_ci(excess.tolist(), config.bootstrap) if key not in COMPARISON_STRATEGIES else None,
            "maxDrawdownWorseThanIndex": (record["metrics"].get("maxDrawdown") - index_dd) if record["metrics"].get("maxDrawdown") is not None and index_dd is not None else None,
            "series": record["series"]["equity"],
        }
    out["index"] = runs["equal-weight-universe"]["benchmark"].get("metrics")
    return out


def run_experiment(snapshot: Snapshot, settings: RunSettings, config: ranking.RankingConfig = ranking.RankingConfig(), *, evaluate_holdout: bool = False) -> Tuple[Dict[str, Any], Dict[str, bytes]]:
    """Blocking. Returns (record, artifacts by family)."""
    decision_ts = rebalance_indices(snapshot, "monthly")
    # Same eligibility as the trading runs, so the model is trained on the stocks it may hold.
    rules = EligibilityRules(min_history=WARMUP, min_median_traded_value=settings.minMedianTradedValueInr, price_floor=settings.priceFloor)
    panel = build_panel(snapshot, decision_ts, rules=rules, horizon=config.horizon)
    split = ranking.split_dates(panel, config)
    trials, best, best_runs = ranking.select(panel, split, config)
    families: Dict[str, Dict[str, Any]] = {}
    validation_predictions: Dict[str, Dict[str, List[Tuple[str, float]]]] = {}
    for kind, trial in best.items():
        run = best_runs[kind]
        ics = ranking.information_coefficients(panel, run.predictions)
        families[kind] = {
            "name": ranking.MODEL_NAMES[kind],
            "params": trial["params"],
            "validation": ranking.ic_summary(ics) | {
                "topDecileSpread": ranking.top_decile_spread(panel, run.predictions),
                "icCi": ranking.bootstrap_mean_ci(list(ics.values()), config.bootstrap),
                "trainingCutoffs": {snapshot.dates[t].isoformat(): snapshot.dates[min(c, snapshot.sessions - 1)].isoformat() for t, c in run.cutoffs.items()},
            },
        }
        validation_predictions[kind] = _predictions_payload(snapshot, run.predictions)
    validation_trading = evaluate_window(snapshot, settings, split.validation, validation_predictions, config)
    holdout_predictions: Dict[str, Dict[str, List[Tuple[str, float]]]] = {}
    holdout_trading = None
    if evaluate_holdout:
        for kind, trial in best.items():
            run = ranking.walk_forward(panel, kind, trial["params"], split.holdout, config)
            ics = ranking.information_coefficients(panel, run.predictions)
            families[kind]["holdout"] = ranking.ic_summary(ics) | {"topDecileSpread": ranking.top_decile_spread(panel, run.predictions), "icCi": ranking.bootstrap_mean_ci(list(ics.values()), config.bootstrap)}
            holdout_predictions[kind] = _predictions_payload(snapshot, run.predictions)
        holdout_trading = evaluate_window(snapshot, settings, split.holdout, holdout_predictions, config)
    criteria = dict(config.criteria)
    artifacts: Dict[str, bytes] = {}
    last_t = snapshot.sessions  # every label that has matured by the end of the data
    for kind, trial in best.items():
        holdout_view = None
        if holdout_trading:
            stressed = holdout_trading["runs"][f"{kind}@stress"]
            holdout_view = {"excessVsEqualWeightAtStress": stressed["excessVsEqualWeight"], "maxDrawdownWorseThanIndex": holdout_trading["runs"][kind]["maxDrawdownWorseThanIndex"]}
        families[kind]["promotion"] = ranking.promotion(criteria, families[kind]["validation"], holdout_view)
        model, train = ranking.fit_final(panel, kind, trial["params"], last_t, config)
        check = train[list(panel.features)].to_numpy()[:200]
        gate = ranking.gate(model, panel.schema_hash, panel.schema_hash, check)
        artifact = gate.pop("artifact")
        families[kind]["final"] = {
            "trainingCutoff": snapshot.dates[min(int(train["label_end"].max()), snapshot.sessions - 1)].isoformat(),
            "trainRows": int(len(train)),
            "gate": gate,
            "artifactBytes": len(artifact),
        }
        if gate["passed"]:
            artifacts[kind] = artifact
    record = {
        "kind": "ranking-experiment",
        "createdAt": now().isoformat(),
        "dataset": {"version": snapshot.version, "universe": snapshot.universe, "survivorshipBiased": bool(snapshot.meta.get("survivorshipBiased")), "period": snapshot.meta.get("period")},
        "code": code_version(),
        "seed": ranking.SEED,
        "config": config.as_dict(),
        "settings": settings.model_dump(mode="json"),
        "schemaHash": panel.schema_hash,
        "features": list(panel.features),
        "featureFamilies": [{"family": name, "description": FAMILY_DESCRIPTIONS[name], "features": list(columns)} for name, columns in NUMERIC_FAMILIES.items()] + [{"family": "sector", "description": FAMILY_DESCRIPTIONS["sector"], "features": [f for f in panel.features if f.startswith("sector_")]}],
        "target": f"Return from the open after the decision to the open {config.horizon} sessions later (dividend-adjusted), minus the equal-weight mean of the same return across eligible stocks.",
        "panel": {"rows": int(len(panel.frame)), "labelled": int(panel.frame["target"].notna().sum()), "decisionDates": int(panel.frame["t"].nunique())},
        "split": {name: {"start": snapshot.dates[ts[0]].isoformat(), "end": snapshot.dates[ts[-1]].isoformat(), "dates": len(ts)} for name, ts in (("development", split.development), ("validation", split.validation), ("holdout", split.holdout))},
        "trials": trials,
        "families": families,
        "validationTrading": validation_trading,
        "holdoutTrading": holdout_trading,
        "holdoutUses": 1 if evaluate_holdout else 0,
        "criteria": criteria,
        "predictions": {"validation": validation_predictions, "holdout": holdout_predictions},
        "caveats": [
            "Each date is scored by the model trainable on that date; the final model is for forward use only.",
            "Forecast quality (IC) does not establish net trading profitability.",
            "The holdout may be looked at once; a second look needs a new holdout.",
        ]
        + list(snapshot.meta.get("caveats", [])),
    }
    return sanitize(record), artifacts


def predictions_for(record: Dict[str, Any], family: str) -> Dict[str, List[Tuple[str, float]]]:
    """Validation + holdout walk-forward predictions, by date (each from its own trainable model)."""
    merged: Dict[str, List[Tuple[str, float]]] = {}
    for part in ("validation", "holdout"):
        merged.update(record.get("predictions", {}).get(part, {}).get(family, {}))
    return merged


def public_experiment(record: Dict[str, Any], *, with_predictions: bool = False) -> Dict[str, Any]:
    out = {key: value for key, value in record.items() if key not in ("predictions", "artifactIds")}
    for window in ("validationTrading", "holdoutTrading"):
        if out.get(window) and not with_predictions:
            out[window] = {**out[window], "runs": {key: {k: v for k, v in run.items() if k != "series"} for key, run in out[window]["runs"].items()}}
    if with_predictions:
        out["predictions"] = record.get("predictions")
    return out


def summarize_experiment(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": record.get("id"),
        "createdAt": record.get("createdAt"),
        "dataset": record.get("dataset"),
        "holdoutUses": record.get("holdoutUses"),
        "families": {
            kind: {"name": family.get("name"), "maturity": family.get("promotion", {}).get("maturity"), "validationMeanIc": family.get("validation", {}).get("meanIc"), "trainingCutoff": family.get("final", {}).get("trainingCutoff")}
            for kind, family in record.get("families", {}).items()
        },
    }
