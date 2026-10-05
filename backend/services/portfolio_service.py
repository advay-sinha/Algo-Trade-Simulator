"""Privacy-first portfolio import: scan → validate → resolve → save holdings only.

Order matters and is part of the guarantee:
1. Every string in the raw request is scanned for personal data BEFORE schema validation, so a PAN
   typed into any field is reported by kind ("Row 3, Symbol looks like a PAN") instead of as a
   generic format error. Any finding rejects the whole import and nothing is saved.
2. The allowlist schema (models/portfolio.py) validates the rows; unknown fields are rejected.
3. Each symbol / ISIN must resolve to a real listing (offline catalog, AMFI, or a live quote);
   anything unresolved is returned for fixing, never stored as typed.
4. Only allowlisted holding fields plus server-looked-up instrument metadata are stored.

Responses and logs carry row numbers, field names and kinds only — never values.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional, Tuple

from pydantic import ValidationError

from backend.models.portfolio import MAX_HOLDINGS_PER_IMPORT, HoldingRow, ImportRequest
from backend.services import amfi, pii, symbol_catalog
from backend.services import market_data_service as market

logger = logging.getLogger("algo_trade_backend.portfolio")

ROW_FIELDS = ("symbol", "isin", "quantity", "avgCost", "buyDate", "assetType")
FIELD_LABELS = {"symbol": "Symbol", "isin": "ISIN", "quantity": "Quantity", "avgCost": "Average cost", "buyDate": "Purchase date", "assetType": "Asset type"}
LIVE_SOURCES = {"live", "cached"}
ETF_TYPES = {"ETF"}


class ImportRejected(Exception):
    """Whole import refused; `detail` is safe to return (no submitted values)."""

    def __init__(self, status: int, detail: Dict[str, Any]) -> None:
        super().__init__(detail.get("code"))
        self.status = status
        self.detail = detail


def _field_name(key: Any) -> str:
    # Unknown keys could themselves hold personal data — never echo them.
    return key if isinstance(key, str) and key in ROW_FIELDS else "other"


def scan_payload(payload: Any) -> List[pii.Finding]:
    rows = payload.get("rows") if isinstance(payload, dict) else None
    if not isinstance(rows, list):
        return []
    findings: List[pii.Finding] = []
    for index, row in enumerate(rows[: MAX_HOLDINGS_PER_IMPORT + 1], start=1):
        if not isinstance(row, dict):
            continue
        for key, value in row.items():
            if isinstance(value, str) and value:
                field = _field_name(key)
                findings.extend(pii.Finding(field=field, kind=kind, row=index) for kind in pii.scan_text(value, field))
            if isinstance(key, str) and key not in ROW_FIELDS:
                findings.extend(pii.Finding(field="other", kind=kind, row=index) for kind in pii.scan_text(key, "other"))
    return findings


def _message_for(findings: List[pii.Finding]) -> str:
    first = findings[0]
    where = f"Row {first.row}, {FIELD_LABELS.get(first.field, 'a column')}"
    more = f" and {len(findings) - 1} more" if len(findings) > 1 else ""
    return f"We didn't save your import. {where} looks like {pii.KIND_LABELS[first.kind]}{more}. Remove it and upload again."


def _validation_detail(exc: ValidationError) -> Dict[str, Any]:
    problems = []
    for error in exc.errors()[:20]:
        loc = [part for part in error.get("loc", ())]
        row = loc[1] + 1 if len(loc) > 1 and loc[0] == "rows" and isinstance(loc[1], int) else None
        field = _field_name(loc[2]) if len(loc) > 2 else None
        problems.append({"row": row, "field": field, "type": error.get("type"), "message": str(error.get("msg", "")).removeprefix("Value error, ")})
    return {"code": "invalid_rows", "message": "Some rows need fixing before they can be imported.", "problems": problems}


def _currency_for(symbol: str, exchange: str) -> str:
    if symbol.endswith((".NS", ".BO")) or exchange in {"NSE", "BSE"}:
        return "INR"
    if symbol.endswith(".L"):
        return "GBP"
    return "USD"


async def _resolve(rows: List[HoldingRow]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Each row → instrument metadata, or an unresolved entry {row, field}."""
    resolved: List[Optional[Dict[str, Any]]] = [None] * len(rows)
    unresolved: List[Dict[str, Any]] = []
    needs_quote: Dict[str, List[int]] = {}
    needs_amfi: List[int] = []

    for position, row in enumerate(rows):
        symbol = row.symbol.upper() if row.symbol else None
        if row.isin and not symbol:
            symbol = symbol_catalog.resolve_isin(row.isin)
            if symbol is None:
                needs_amfi.append(position)
                continue
        entry = symbol_catalog.lookup(symbol) if symbol else None
        if entry:
            resolved[position] = {
                "symbol": entry["symbol"],
                "isin": row.isin or entry.get("isin"),
                "name": entry["name"],
                "exchange": entry["exchange"],
                "currency": _currency_for(entry["symbol"], entry["exchange"]),
                "type": entry["type"],
                "sector": entry.get("sector"),
            }
        elif symbol:
            needs_quote.setdefault(symbol, []).append(position)

    if needs_amfi:
        try:
            schemes = await asyncio.gather(*(asyncio.to_thread(amfi.scheme_by_isin, rows[position].isin or "") for position in needs_amfi))
        except amfi.AmfiUnavailable as exc:
            raise ImportRejected(503, {"code": "fund_lookup_unavailable", "message": "We couldn't check mutual fund ISINs right now, so nothing was saved. Try again in a few minutes."}) from exc
        for position, scheme in zip(needs_amfi, schemes):
            if scheme is None:
                unresolved.append({"row": position + 1, "field": "isin"})
                continue
            resolved[position] = {
                "symbol": None,
                "isin": rows[position].isin,
                "schemeCode": scheme["schemeCode"],
                "name": scheme["name"],
                "exchange": "AMFI",
                "currency": "INR",
                "type": "MF",
                "sector": scheme.get("category"),
            }

    if needs_quote:
        quotes = await market.get_quotes(list(needs_quote))
        by_symbol = {str(quote.get("symbol", "")).upper(): quote for quote in quotes}
        for symbol, positions in needs_quote.items():
            quote = by_symbol.get(symbol)
            if not quote or quote.get("source") not in LIVE_SOURCES or not quote.get("price"):
                unresolved.extend({"row": position + 1, "field": "symbol"} for position in positions)
                continue
            for position in positions:
                resolved[position] = {
                    "symbol": symbol,
                    "isin": rows[position].isin,
                    "name": symbol,
                    "exchange": None,
                    "currency": quote.get("currency") or _currency_for(symbol, ""),
                    "type": None,
                    "sector": None,
                }
    return [item for item in resolved if item is not None], sorted(unresolved, key=lambda item: item["row"])


def _asset_type(row: HoldingRow, instrument: Dict[str, Any]) -> str:
    if instrument.get("type") == "MF":
        return "mutual_fund"
    if instrument.get("type") in ETF_TYPES and row.assetType == "equity":
        return "etf"
    return row.assetType


async def prepare_holdings(payload: Any) -> Tuple[str, List[Dict[str, Any]]]:
    """All checks of an import (scan, schema, resolve) without saving. Returns (source, holdings)."""
    findings = scan_payload(payload)
    if findings:
        logger.info("portfolio import rejected: personal data %s", pii.count_by_kind(findings))
        raise ImportRejected(422, {"code": "personal_data_detected", "message": _message_for(findings), "findings": [finding.public() for finding in findings]})
    try:
        request = ImportRequest.model_validate(payload)
    except ValidationError as exc:
        logger.info("portfolio import rejected: %d invalid fields", len(exc.errors()))
        raise ImportRejected(422, _validation_detail(exc)) from None

    instruments, unresolved = await _resolve(request.rows)
    if unresolved:
        logger.info("portfolio import rejected: %d unresolved instruments", len(unresolved))
        raise ImportRejected(
            422,
            {
                "code": "unresolved_instruments",
                "message": f"We didn't save your import. {len(unresolved)} row{'s' if len(unresolved) != 1 else ''} didn't match a listed instrument. Check the symbol or ISIN and upload again.",
                "rows": unresolved,
            },
        )

    holdings: List[Dict[str, Any]] = []
    for row, instrument in zip(request.rows, instruments):
        holdings.append(
            instrument
            | {
                "assetType": _asset_type(row, instrument),
                "quantity": row.quantity,
                "avgCost": row.avgCost,
                "buyDate": row.buyDate.isoformat() if row.buyDate else None,
            }
        )
    return request.source, holdings


async def import_holdings(user_id: str, payload: Any, store: Any) -> Dict[str, Any]:
    source, holdings = await prepare_holdings(payload)
    saved = await store.add_portfolio_import(user_id, {"source": source, "rowCount": len(holdings)}, holdings)
    logger.info("portfolio import saved: %d holdings", len(holdings))
    return {"import": public_import(saved["import"]), "holdings": [public_holding(item) for item in saved["holdings"]]}


def public_import(record: Dict[str, Any]) -> Dict[str, Any]:
    return {key: record.get(key) for key in ("id", "source", "rowCount", "createdAt")}


def public_holding(record: Dict[str, Any]) -> Dict[str, Any]:
    return {key: record.get(key) for key in ("id", "importId", "symbol", "isin", "schemeCode", "name", "exchange", "currency", "type", "sector", "assetType", "quantity", "avgCost", "buyDate", "createdAt")}


async def portfolio_for_user(user_id: str, store: Any) -> Dict[str, Any]:
    data = await store.list_portfolio(user_id)
    return {"imports": [public_import(item) for item in data["imports"]], "holdings": [public_holding(item) for item in data["holdings"]]}
