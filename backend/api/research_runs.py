"""Strategy-research endpoints (Phase 13): datasets, universes, fee schedules, universe strategies, runs, comparisons.

Distinct from /api/research/* (Phase 7 research notes). Datasets are shared, read-only research
snapshots written by scripts/build_research_snapshot.py; no route downloads market data in bulk.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response

from backend.deps import Store, get_current_user, get_store
from backend.models.common import SYMBOL_PATTERN
from backend.models.research_runs import CompareRequest, RunRequest
from backend.services import ranking_service, research_runs, run_tracking
from backend.strategies.portfolio_strategies import list_portfolio_strategies
from backend.research.snapshots import public_meta
from backend.research.universe import describe_universes
from backend.services.cost_model import describe_schedules
from backend.services.portfolio_engine import ENGINE_VERSION, EngineConfig, assumptions
from backend.services.rate_limiter import rate_limit

router = APIRouter(prefix="/api")
research_runs_rate_limit = rate_limit("research-runs", 60)


@router.get("/research-runs/datasets", dependencies=[Depends(research_runs_rate_limit)])
async def list_datasets(user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> List[Dict[str, Any]]:
    return [public_meta(meta) for meta in await store.list_research_datasets()]


@router.get("/research-runs/datasets/{version}", dependencies=[Depends(research_runs_rate_limit)])
async def get_dataset(
    version: str = Path(..., pattern=r"^[0-9a-f]{64}$"),
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    meta = await store.get_research_dataset(version)
    if meta is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return public_meta(meta, with_coverage=True)


@router.get("/research-runs/universes", dependencies=[Depends(research_runs_rate_limit)])
async def list_universes(user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    return describe_universes()


@router.get("/research-runs/fee-schedules", dependencies=[Depends(research_runs_rate_limit)])
async def list_fee_schedules(user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    return describe_schedules()


@router.get("/research-runs/engine", dependencies=[Depends(research_runs_rate_limit)])
async def engine_info(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    defaults = EngineConfig()
    return {"engineVersion": ENGINE_VERSION, "defaults": defaults.__dict__, "assumptions": assumptions(defaults, defaults.schedule())}


# ---------------------------------------------------------------------------------------------
# Universe strategies, runs and comparisons (Phase 13b). Static paths come before /{run_id}.

research_run_rate_limit = rate_limit("research-run", 12)
research_compare_rate_limit = rate_limit("research-compare", 4)
RUN_ID = r"^[0-9a-f]{32}$"
DETAIL_EXCLUDES = ("fills", "holdings", "decisions", "orderEvents", "dividends")


@router.get("/research-runs/strategies", dependencies=[Depends(research_runs_rate_limit)])
async def list_universe_strategies(user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    return list_portfolio_strategies()


@router.get("/research-runs/models", dependencies=[Depends(research_runs_rate_limit)])
async def list_ranking_models(user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> List[Dict[str, Any]]:
    return [ranking_service.summarize_experiment(record) for record in await store.list_ranking_experiments()]


@router.get("/research-runs/models/{experiment_id}", dependencies=[Depends(research_runs_rate_limit)])
async def get_ranking_model(experiment_id: str = Path(..., pattern=RUN_ID), user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    record = await store.get_ranking_experiment(experiment_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Ranking experiment not found")
    return ranking_service.public_experiment(record)


@router.post("/research-runs", dependencies=[Depends(research_run_rate_limit)])
async def create_run(payload: RunRequest, user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    try:
        record = await research_runs.run_for_user(payload, user["id"], store)
    except research_runs.RunError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc
    return _detail(record)


@router.post("/research-runs/compare", dependencies=[Depends(research_compare_rate_limit)])
async def create_comparison(payload: CompareRequest, user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    try:
        return await research_runs.compare_for_user(payload, user["id"], store)
    except research_runs.RunError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc


@router.get("/research-runs", dependencies=[Depends(research_runs_rate_limit)])
async def list_runs(user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> List[Dict[str, Any]]:
    return await store.list_research_runs(user["id"])


def _detail(record: Dict[str, Any]) -> Dict[str, Any]:
    out = {key: value for key, value in record.items() if key not in DETAIL_EXCLUDES and key != "userId"}
    if record.get("kind") == "run":
        out["counts"] = {
            "fills": record.get("fillsTotal", len(record.get("fills", []))),
            "fillsStored": len(record.get("fills", [])),
            "holdingChanges": len(record.get("holdings", [])),
            "decisions": record.get("decisionCount"),
            "orderEvents": record.get("orderEventsTotal", 0),
            "dividends": len(record.get("dividends", [])),
        }
    return out


async def _run_or_404(store: Store, user_id: str, run_id: str) -> Dict[str, Any]:
    record = await store.get_research_run(user_id, run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Research run not found")
    return record


@router.get("/research-runs/{run_id}", dependencies=[Depends(research_runs_rate_limit)])
async def get_run(run_id: str = Path(..., pattern=RUN_ID), user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    return _detail(await _run_or_404(store, user["id"], run_id))


@router.get("/research-runs/{run_id}/fills", dependencies=[Depends(research_runs_rate_limit)])
async def get_run_fills(
    run_id: str = Path(..., pattern=RUN_ID),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=1000),
    symbol: Optional[str] = Query(default=None, pattern=SYMBOL_PATTERN),
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    record = await _run_or_404(store, user["id"], run_id)
    fills = list(reversed(record.get("fills", [])))  # newest first
    if symbol:
        fills = [fill for fill in fills if fill["symbol"] == symbol.upper()]
    return {
        "total": len(fills),
        "totalInRun": record.get("fillsTotal", len(fills)),
        "items": fills[offset : offset + limit],
        "orderEvents": list(reversed(record.get("orderEvents", [])))[:200],
        "dividends": list(reversed(record.get("dividends", [])))[:200],
    }


@router.get("/research-runs/{run_id}/holdings", dependencies=[Depends(research_runs_rate_limit)])
async def get_run_holdings(
    run_id: str = Path(..., pattern=RUN_ID),
    on: Optional[date] = Query(default=None, alias="date"),
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    record = await _run_or_404(store, user["id"], run_id)
    history = record.get("holdings", [])
    if not history:
        return {"asOf": None, "positions": [], "decision": None}
    target = on.isoformat() if on else history[-1]["date"]
    entry = None
    for item in history:
        if item["date"] <= target:
            entry = item
        else:
            break
    decision = None
    for item in record.get("decisions", []):
        if item["date"] <= target:
            decision = item
        else:
            break
    return {
        "asOf": entry["date"] if entry else None,
        "positions": [{"symbol": symbol, "shares": shares} for symbol, shares in (entry["positions"] if entry else [])],
        "decision": {"date": decision["date"], "weights": [{"symbol": s, "weight": w} for s, w in decision["weights"]]} if decision else None,
        "truncated": bool(record.get("holdingsTruncated")),
    }


@router.post("/research-runs/{run_id}/replay", dependencies=[Depends(research_run_rate_limit)])
async def replay_run(run_id: str = Path(..., pattern=RUN_ID), user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    record = await _run_or_404(store, user["id"], run_id)
    try:
        return await run_tracking.replay(store, user["id"], record)
    except research_runs.RunError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc


@router.get("/research-runs/{run_id}/export", dependencies=[Depends(research_runs_rate_limit)])
async def export_run(run_id: str = Path(..., pattern=RUN_ID), user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Response:
    record = await _run_or_404(store, user["id"], run_id)
    if record.get("kind") != "run":
        raise HTTPException(status_code=422, detail="Export a single run; comparisons link to their runs")
    data = run_tracking.zip_artifacts(record)
    return Response(content=data, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="research-run-{run_id[:8]}.zip"'})
