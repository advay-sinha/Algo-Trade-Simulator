"""Portfolio of real holdings: privacy-first import, listing and hard delete (Phase 10a)."""
from __future__ import annotations

from typing import Any, Dict

from typing import Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse

from backend.deps import Store, get_current_user, get_store
from backend.models.common import SYMBOL_PATTERN
from backend.models.portfolio import WhatIfRequest
from backend.services import portfolio_report, portfolio_service
from backend.services.rate_limiter import rate_limit

router = APIRouter(prefix="/api")
import_rate_limit = rate_limit("portfolio-import", 20)
portfolio_rate_limit = rate_limit("portfolio", 60)
report_rate_limit = rate_limit("portfolio-report", 20)
MAX_IMPORT_BYTES = 256 * 1024  # 100 holding rows are a few KB; files never come here


def _body_size_guard(request: Request) -> None:
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Import is too large. Send at most 100 holding rows.")


@router.post("/portfolio/imports", dependencies=[Depends(import_rate_limit), Depends(_body_size_guard)])
async def import_holdings(payload: Any = Body(...), user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Any:
    try:
        return await portfolio_service.import_holdings(user["id"], payload, store)
    except portfolio_service.ImportRejected as exc:
        return JSONResponse(status_code=exc.status, content={"detail": exc.detail})


@router.get("/portfolio", dependencies=[Depends(portfolio_rate_limit)])
async def get_portfolio(user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    return await portfolio_service.portfolio_for_user(user["id"], store)


@router.delete("/portfolio/imports/{import_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_import(import_id: str, user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Response:
    try:
        await store.delete_portfolio_import(user["id"], import_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Import not found") from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/portfolio", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_portfolio(user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Response:
    await store.delete_portfolio(user["id"])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


ReportRangeQuery = Literal["6mo", "1y", "2y", "5y"]


async def _saved_holdings(user_id: str, store: Store) -> list:
    data = await store.list_portfolio(user_id)
    if not data["holdings"]:
        raise HTTPException(status_code=404, detail="No holdings yet. Import some first.")
    return data["holdings"]


@router.get("/portfolio/report", dependencies=[Depends(report_rate_limit)])
async def get_report(
    range: ReportRangeQuery = Query(default="1y"),
    benchmark: str = Query(default="^NSEI", pattern=SYMBOL_PATTERN),
    confidence: float = Query(default=0.95, ge=0.8, le=0.99),
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    holdings = await _saved_holdings(user["id"], store)
    return await portfolio_report.build_report(holdings, range_name=range, benchmark=benchmark.upper(), confidence=confidence)


@router.post("/portfolio/what-if", dependencies=[Depends(report_rate_limit)])
async def what_if(payload: WhatIfRequest, user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    holdings = await _saved_holdings(user["id"], store)
    report, context = await portfolio_report.build_report(holdings, range_name=payload.range, benchmark=payload.benchmark.upper(), confidence=payload.confidence, with_context=True)
    cap = (payload.cap.key, payload.cap.maxWeight) if payload.cap else None
    shock = payload.shock.model_dump() if payload.shock else None
    return portfolio_report.what_if(report, context, cap=cap, remove=payload.remove, shock=shock)


@router.post("/portfolio/report/preview", dependencies=[Depends(report_rate_limit), Depends(_body_size_guard)])
async def preview_report(
    payload: Any = Body(...),
    range: ReportRangeQuery = Query(default="1y"),
    benchmark: str = Query(default="^NSEI", pattern=SYMBOL_PATTERN),
    confidence: float = Query(default=0.95, ge=0.8, le=0.99),
    user: Dict[str, Any] = Depends(get_current_user),
) -> Any:
    """'Analyze without saving': the same checks as an import, then a report — nothing is stored."""
    try:
        _, holdings = await portfolio_service.prepare_holdings(payload)
    except portfolio_service.ImportRejected as exc:
        return JSONResponse(status_code=exc.status, content={"detail": exc.detail})
    return await portfolio_report.build_report(holdings, range_name=range, benchmark=benchmark.upper(), confidence=confidence)
