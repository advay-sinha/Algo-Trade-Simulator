"""Strategy-research runs and comparisons (Phase 13b).

One path for every universe strategy: snapshot → eligibility at each decision close → the
strategy's target weights (data up to that close only) → portfolio engine → metrics against the
benchmark → a persisted, user-scoped record. Comparisons force identical settings on every run,
always include the equal-weight universe baseline, and add a cost-stress twin for each strategy.

Blocking work (`execute`, `compare`) runs in a worker thread from the routes.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
from pydantic import ValidationError

from backend.analytics.metrics import PERIODS_PER_YEAR, beta_alpha, drawdown_profile, period_returns, sanitize, series_metrics
from backend.models.research_runs import CompareRequest, RunRequest, RunSettings, StrategySpec
from backend.research.snapshots import Snapshot, load_snapshot
from backend.research.universe import EligibilityRules, eligible_at, rebalance_indices, sector_map
from backend.services import symbol_catalog
from backend.services.run_tracking import attach_artifact_hashes
from backend.services import run_tracking
from backend.services.backtesting_service import downsample
from backend.services.build_info import code_version
from backend.services.clock import now
from backend.services.portfolio_engine import Decision, EngineConfig, EngineError, run_portfolio
from backend.strategies.portfolio_base import DecisionContext, PortfolioStrategy
from backend.strategies.portfolio_strategies import BASELINE_ID, get_portfolio_strategy

logger = logging.getLogger("algo_trade_backend.research_runs")

MAX_STORED_FILLS = 3000
MAX_STORED_HOLDINGS = 2500
MAX_STORED_DECISIONS = 520
MAX_STORED_EVENTS = 500
MAX_STORED_DIVIDENDS = 1000
BENCHMARK_CAVEAT = "The benchmark line is the index level (price index: no dividends, no costs), not a tradable fund."
PPY = PERIODS_PER_YEAR["1d"]


class RunError(Exception):
    def __init__(self, message: str, status: int = 422) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def _window(snapshot: Snapshot, settings: RunSettings) -> Tuple[int, int]:
    start = 0
    if settings.start:
        dates = snapshot.dates
        start = next((i for i, day in enumerate(dates) if day >= settings.start), None)  # type: ignore[assignment]
        if start is None:
            raise RunError("The start date is after the dataset ends")
    end = snapshot.sessions - 1
    if settings.end:
        end = snapshot.index_of(settings.end)
    if end - start < 20:
        raise RunError("The window needs at least 20 sessions")
    return start, end


def _strategy(spec: StrategySpec) -> Tuple[PortfolioStrategy, Any]:
    try:
        strategy = get_portfolio_strategy(spec.strategy)
    except KeyError as exc:
        raise RunError(f"Unknown universe strategy: {spec.strategy}") from exc
    try:
        params = strategy.parse_params(spec.params)
    except ValidationError as exc:
        problems = "; ".join(f"{'.'.join(str(p) for p in error['loc']) or 'params'}: {error['msg']}" for error in exc.errors())
        raise RunError(f"Invalid parameters for {strategy.name}: {problems}") from exc
    return strategy, params


def default_label(strategy: PortfolioStrategy, params: Any) -> str:
    if strategy.id == "ml-ranking":
        model = "boosted trees" if params.family == "hgb" else "ridge"
        return f"{strategy.name} ({model}, experiment {params.model[:8]})"
    defaults = strategy.params_model().model_dump()
    changed = [f"{key}={value}" for key, value in params.model_dump().items() if defaults.get(key) != value]
    return f"{strategy.name} ({', '.join(changed)})" if changed else strategy.name


def _engine_config(settings: RunSettings, tolerance: float, cost_multiplier: float) -> EngineConfig:
    return EngineConfig(
        capital=settings.capital,
        fee_schedule=settings.feeSchedule,
        brokerage=settings.brokerage,
        brokerage_flat_inr=settings.brokerageFlatInr,
        brokerage_bps=settings.brokerageBps,
        cost_bps=settings.costBps,
        cost_multiplier=cost_multiplier,
        slippage_bps=settings.slippageBps,
        participation_cap=settings.participationCap,
        tolerance=tolerance,
        min_trade_value=settings.minTradeValue,
        cash_buffer=settings.cashBuffer,
    )


def _points(series: pd.Series) -> List[Dict[str, Any]]:
    return downsample([{"timestamp": ts.isoformat(), "value": float(value)} for ts, value in series.items()])


def execute(
    snapshot: Snapshot,
    settings: RunSettings,
    spec: StrategySpec,
    *,
    cost_multiplier: float = 1.0,
    trial: Tuple[int, int] = (1, 1),
    extras: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Blocking. Returns a JSON-safe record (without id/userId)."""
    strategy, params = _strategy(spec)
    start, end = _window(snapshot, settings)
    tolerance = spec.tolerance if spec.tolerance is not None else strategy.default_tolerance
    rules = EligibilityRules(
        min_history=strategy.warmup_sessions(params),
        min_median_traded_value=settings.minMedianTradedValueInr,
        price_floor=settings.priceFloor,
    )
    sectors = sector_map(snapshot.symbols)
    decisions: Dict[int, Decision] = {}
    previous: Optional[Decision] = None
    for t in rebalance_indices(snapshot, strategy.rebalance(params), start, end):
        context = DecisionContext(eligible=eligible_at(snapshot, t, rules), previous=previous, sectors=sectors, extra=(extras or {}).get(strategy.id, {}))
        decision = strategy.decide(snapshot.view(t), context, params)
        decisions[t] = decision
        previous = decision
    try:
        result = run_portfolio(snapshot, decisions, _engine_config(settings, tolerance, cost_multiplier), start=start, end=end)
    except EngineError as exc:
        raise RunError(str(exc)) from exc
    series = result.pop("_series")
    equity = series["equity"]
    values, reasons = series_metrics(equity, PPY, settings.riskFreeRate)
    profile = drawdown_profile(equity)

    bench_raw = pd.Series(snapshot.benchmark["adj_close"][start : end + 1], index=equity.index).dropna()
    benchmark: Dict[str, Any] = {"symbol": snapshot.benchmark_symbol, "label": f"{snapshot.benchmark_symbol} index level", "available": len(bench_raw) > 1}
    bench_curve = pd.Series(dtype=float)
    if benchmark["available"]:
        bench_curve = bench_raw / bench_raw.iloc[0] * settings.capital
        bench_values, bench_reasons = series_metrics(bench_curve, PPY, settings.riskFreeRate)
        relation = beta_alpha(period_returns(equity), period_returns(bench_curve), PPY, settings.riskFreeRate)
        benchmark |= {
            "metrics": bench_values,
            "reasons": bench_reasons,
            "beta": relation["beta"][0],
            "alpha": relation["alpha"][0],
            "correlation": relation["correlation"][0],
            "excessReturn": (values.get("totalReturn") or 0.0) - (bench_values.get("totalReturn") or 0.0) if values.get("totalReturn") is not None and bench_values.get("totalReturn") is not None else None,
            "missingSessions": int((end - start + 1) - len(bench_raw)),
        }
    label = spec.label or default_label(strategy, params)
    if cost_multiplier != 1.0:
        label = f"{label} (costs x{cost_multiplier:g})"
    fills = result["fills"]
    record = {
        "kind": "run",
        "label": label,
        "strategy": {"id": strategy.id, "name": strategy.name, "params": params.model_dump(), "metadata": strategy.describe()["metadata"]},
        "dataset": {
            "version": snapshot.version,
            "universe": snapshot.universe,
            "benchmarkSymbol": snapshot.benchmark_symbol,
            "period": snapshot.meta.get("period"),
            "survivorshipBiased": bool(snapshot.meta.get("survivorshipBiased")),
        },
        "settings": settings.model_dump(mode="json", exclude={"strategies", "costStress", "strategy", "params", "tolerance", "label"}),
        "tolerance": tolerance,
        "costMultiplier": cost_multiplier,
        "engineVersion": result["engineVersion"],
        "configHash": result["configHash"],
        "resultHash": result["resultHash"],
        "period": result["period"],
        "summary": result["summary"],
        "metrics": values,
        "metricReasons": reasons,
        "drawdown": {key: profile.get(key) for key in ("maxDrawdown", "peak", "trough", "recovery", "durationBars", "recovered") if key in profile},
        "benchmark": benchmark,
        "series": {
            "equity": result["equity"],
            "drawdown": result["drawdown"],
            "exposure": result["exposure"],
            "benchmark": _points(bench_curve) if len(bench_curve) else [],
        },
        "decisionCount": len(decisions),
        # Symbol-keyed maps become [symbol, value] pairs: tickers contain dots, which make poor Mongo keys.
        "decisions": [{"date": d["date"], "weights": sorted(d["weights"].items())} for d in result["decisions"][-MAX_STORED_DECISIONS:]],
        "fills": fills[-MAX_STORED_FILLS:],
        "fillsTotal": len(fills),
        "holdings": [{"date": h["date"], "positions": sorted(h["positions"].items())} for h in result["holdings"][-MAX_STORED_HOLDINGS:]],
        "holdingsTruncated": len(result["holdings"]) > MAX_STORED_HOLDINGS,
        "orderEvents": result["orderEvents"][-MAX_STORED_EVENTS:],
        "orderEventsTotal": len(result["orderEvents"]),
        "dividends": result["dividends"][-MAX_STORED_DIVIDENDS:],
        "pending": result["pending"],
        "assumptions": result["assumptions"] | {
            "eligibility": f"At each decision close: a bar with volume that session, ≥ {rules.min_history} sessions of history, median traded value over 63 sessions ≥ ₹{settings.minMedianTradedValueInr:,.0f}, close ≥ ₹{settings.priceFloor:g}.",
            "benchmark": BENCHMARK_CAVEAT,
            "annualisation": f"{PPY} sessions per year; risk-free rate {settings.riskFreeRate:.2%}.",
        },
        "feeSchedule": result["feeSchedule"],
        "caveats": list(dict.fromkeys(list(snapshot.meta.get("caveats", [])) + list(strategy.caveats) + [BENCHMARK_CAVEAT])),
        "manifest": {
            "code": code_version(),
            "dataset": {
                "version": snapshot.version,
                "universe": snapshot.universe,
                "benchmark": snapshot.benchmark_symbol,
                "source": snapshot.meta.get("source"),
                "downloadedAt": snapshot.meta.get("downloadedAt"),
                "survivorshipBiased": bool(snapshot.meta.get("survivorshipBiased")),
                "sectorCatalog": symbol_catalog.generated_at(),
            },
            "window": {"start": result["period"]["start"], "end": result["period"]["end"]},
            "strategy": {"id": strategy.id, "params": params.model_dump(), "rebalance": strategy.rebalance(params)},
            "engine": {"version": result["engineVersion"], "configHash": result["configHash"], "resultHash": result["resultHash"]},
            "costs": {
                "feeSchedule": settings.feeSchedule,
                "feeVersions": sorted({fill["feeVersion"] for fill in fills if fill.get("feeVersion")}),
                "brokerage": settings.brokerage,
                "slippageBps": settings.slippageBps,
                "costMultiplier": cost_multiplier,
            },
            "seed": None,
            "trial": {"index": trial[0], "count": trial[1]},
        },
    }
    return attach_artifact_hashes(sanitize(record))


def summarize(record: Dict[str, Any]) -> Dict[str, Any]:
    keys = ("id", "kind", "label", "createdAt", "costMultiplier", "comparisonId", "engineVersion", "period")
    out = {key: record.get(key) for key in keys if key in record}
    out["status"] = {
        "replayIdentical": (record.get("lastReplay") or {}).get("identical"),
        "tracked": (record.get("tracking") or {}).get("logged") if (record.get("tracking") or {}).get("enabled") else None,
    }
    if record.get("kind") == "comparison":
        out["runs"] = [{"runId": row["runId"], "label": row["label"]} for row in record.get("rows", [])]
        out["dataset"] = record.get("dataset")
        return out
    strategy = record.get("strategy", {})
    out["strategy"] = {"id": strategy.get("id"), "name": strategy.get("name"), "maturity": strategy.get("metadata", {}).get("maturity")}
    out["dataset"] = {key: record.get("dataset", {}).get(key) for key in ("version", "universe", "survivorshipBiased")}
    metrics = record.get("metrics", {})
    summary = record.get("summary", {})
    out["headline"] = {
        "totalReturn": metrics.get("totalReturn"),
        "cagr": metrics.get("cagr"),
        "maxDrawdown": metrics.get("maxDrawdown"),
        "sharpe": metrics.get("sharpe"),
        "annualTurnover": summary.get("annualTurnover"),
        "totalCosts": summary.get("totalCosts"),
        "excessReturn": record.get("benchmark", {}).get("excessReturn"),
    }
    return out


def _row(record: Dict[str, Any], run_id: str) -> Dict[str, Any]:
    summary = summarize(record)
    return {
        "runId": run_id,
        "label": record["label"],
        "strategyId": record["strategy"]["id"],
        "maturity": record["strategy"]["metadata"].get("maturity"),
        "costMultiplier": record["costMultiplier"],
        "headline": summary["headline"],
        "metrics": record["metrics"],
        "summary": {key: record["summary"].get(key) for key in ("finalEquity", "totalCosts", "costBreakdown", "dividends", "annualTurnover", "averageExposure", "fills")},
    }


def _rebased(points: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not points:
        return []
    base = points[0]["value"] or 1.0
    return [{"timestamp": p["timestamp"], "value": p["value"] / base * 100} for p in points]


def compare_specs(request: CompareRequest) -> List[Tuple[StrategySpec, float]]:
    specs: List[Tuple[StrategySpec, float]] = []
    for spec in request.strategies:
        specs.append((spec, 1.0))
        if spec.strategy != BASELINE_ID and request.costStress > 1.0:
            specs.append((spec, request.costStress))
    if not any(spec.strategy == BASELINE_ID for spec, _ in specs):
        specs.append((StrategySpec(strategy=BASELINE_ID, label="Baseline: equal-weight universe"), 1.0))
    return specs


async def load(store: Any, version: str) -> Snapshot:
    snapshot = await load_snapshot(store, version)
    if snapshot is None:
        raise RunError("Dataset not found", status=404)
    return snapshot


async def model_extras(store: Any, specs: List[StrategySpec], dataset_version: str) -> Tuple[Dict[str, Any], Optional[str]]:
    """Stored walk-forward predictions for `ml-ranking` specs (+ the first predicted date)."""
    from backend.services.ranking_service import predictions_for  # local: avoids an import cycle

    wanted = [spec for spec in specs if spec.strategy == "ml-ranking"]
    if not wanted:
        return {}, None
    if len({(spec.params.get("model"), spec.params.get("family", "hgb")) for spec in wanted}) > 1:
        raise RunError("Compare one ranking model at a time")
    spec = wanted[0]
    model_id = str(spec.params.get("model") or "")
    if not model_id:
        raise RunError("Choose a ranking experiment for the ML ranking strategy")
    experiment = await store.get_ranking_experiment(model_id)
    if experiment is None:
        raise RunError("Ranking experiment not found", status=404)
    if experiment["dataset"]["version"] != dataset_version:
        raise RunError("That ranking experiment was trained on a different dataset; run it on its own dataset", status=409)
    family = str(spec.params.get("family", "hgb"))
    predictions = predictions_for(experiment, family)
    if not predictions:
        raise RunError("That experiment has no stored predictions for this model", status=409)
    return {"ml-ranking": {"predictions": predictions}}, min(predictions)


async def run_for_user(request: RunRequest, user_id: str, store: Any) -> Dict[str, Any]:
    snapshot = await load(store, request.datasetVersion)
    extras, first = await model_extras(store, [request], request.datasetVersion)
    if first and request.start is None:
        request = request.model_copy(update={"start": date.fromisoformat(first)})
    record = await asyncio.to_thread(execute, snapshot, request, request, extras=extras)
    stored = await store.add_research_run(user_id, record)
    logger.info("research run %s (%s) on %s", stored["id"], record["strategy"]["id"], snapshot.version[:12])
    await run_tracking.track(store, user_id, stored)
    return stored


async def compare_for_user(request: CompareRequest, user_id: str, store: Any) -> Dict[str, Any]:
    snapshot = await load(store, request.datasetVersion)
    specs = compare_specs(request)
    extras, first = await model_extras(store, [spec for spec, _ in specs], request.datasetVersion)
    if first and request.start is None:
        request = request.model_copy(update={"start": date.fromisoformat(first)})

    def run_all() -> List[Dict[str, Any]]:
        return [execute(snapshot, request, spec, cost_multiplier=multiplier, trial=(index + 1, len(specs)), extras=extras) for index, (spec, multiplier) in enumerate(specs)]

    records = await asyncio.to_thread(run_all)
    rows = []
    stored_runs = []
    for record in records:
        stored = await store.add_research_run(user_id, record)
        stored_runs.append(stored)
        rows.append(_row(record, stored["id"]))
    first = records[0]
    comparison = sanitize(
        {
            "kind": "comparison",
            "label": " vs ".join(dict.fromkeys(r["label"] for r in records if r["costMultiplier"] == 1.0)),
            "dataset": first["dataset"],
            "settings": first["settings"],
            "costStress": request.costStress,
            "period": first["period"],
            "rows": rows,
            "series": {
                "runs": [{"runId": row["runId"], "label": row["label"], "equity": _rebased(record["series"]["equity"])} for row, record in zip(rows, records)],
                "benchmark": _rebased(first["series"]["benchmark"]),
            },
            "benchmark": {key: first["benchmark"].get(key) for key in ("symbol", "label", "metrics", "available")},
            "caveats": list(dict.fromkeys(c for record in records for c in record["caveats"])),
            "conventions": {
                "identical": "Every run uses the same dataset, dates, capital, universe, eligibility rules, fee schedule and slippage.",
                "stress": f"Rows marked 'costs x{request.costStress:g}' rerun the strategy with every charge multiplied by {request.costStress:g}.",
                "rebased": "Curves are rebased to 100 at the first session.",
            },
        }
    )
    stored_comparison = await store.add_research_run(user_id, comparison)
    for stored in stored_runs:
        await store.set_research_run_comparison(user_id, stored["id"], stored_comparison["id"])
    await run_tracking.track_many(store, user_id, stored_runs)
    tracked = [stored.get("tracking", {}) for stored in stored_runs]
    stored_comparison["tracking"] = {"enabled": any(t.get("enabled") for t in tracked), "logged": sum(1 for t in tracked if t.get("logged")), "runs": len(tracked)}
    await store.set_research_run_fields(user_id, stored_comparison["id"], {"tracking": stored_comparison["tracking"]})
    return stored_comparison
