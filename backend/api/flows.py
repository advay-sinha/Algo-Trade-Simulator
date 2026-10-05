"""Market intelligence: institutional flows, positioning, sector flows, capex (Phase 11)."""
from __future__ import annotations

import hmac
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from backend.config import settings
from backend.deps import Store, get_current_user, get_store
from backend.models.common import parse_symbol_list
from backend.services import flows_service
from backend.services.rate_limiter import rate_limit

router = APIRouter(prefix="/api")
flows_rate_limit = rate_limit("flows", 30)
capex_rate_limit = rate_limit("capex", 10)
refresh_rate_limit = rate_limit("flows-refresh", 6)
MAX_CAPEX_SYMBOLS = 10


@router.get("/market/flows/institutional", dependencies=[Depends(flows_rate_limit)])
async def institutional_flows(days: int = Query(default=30, ge=1, le=250), user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    return await flows_service.institutional(store, days)


@router.get("/market/flows/sectors", dependencies=[Depends(flows_rate_limit)])
async def sector_flows(
    periods: int = Query(default=6, ge=1, le=24),
    performance_range: str = Query(default="1mo", alias="range", pattern="^(1mo|3mo|6mo|1y)$"),
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    return await flows_service.sectors(store, periods, performance_range)


@router.get("/fundamentals/capex", dependencies=[Depends(capex_rate_limit)])
async def company_capex(symbols: str = Query(..., min_length=1, max_length=220), user: Dict[str, Any] = Depends(get_current_user)) -> List[Dict[str, Any]]:
    parsed = parse_symbol_list(symbols)
    if len(parsed) > MAX_CAPEX_SYMBOLS:
        raise HTTPException(status_code=422, detail=f"At most {MAX_CAPEX_SYMBOLS} companies per request")
    return await flows_service.company_capex(parsed)


@router.get("/fundamentals/capex/sectors", dependencies=[Depends(capex_rate_limit)])
async def sector_capex(user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    return await flows_service.sector_capex(store)


def _authorize_cron(request: Request) -> None:
    secret = settings.cron_secret
    if not secret:
        raise HTTPException(status_code=404, detail="Not Found")
    supplied = request.headers.get("authorization", "")
    if not hmac.compare_digest(supplied.encode(), f"Bearer {secret}".encode()):
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.api_route("/internal/flows/refresh", methods=["GET", "POST"], dependencies=[Depends(refresh_rate_limit), Depends(_authorize_cron)])
async def refresh_flows(
    backfill_days: int = Query(default=1, alias="backfillDays", ge=1, le=60),
    backfill_reports: int = Query(default=0, alias="backfillReports", ge=0, le=24),
    capex: bool = Query(default=False),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    """Scheduled capture (Vercel Cron sends GET with the bearer secret). Returns counts only."""
    return await flows_service.refresh(store, backfill_days=backfill_days, backfill_reports=backfill_reports, capex=capex)
