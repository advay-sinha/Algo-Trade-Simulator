"""Copilot-facing views of research runs (Phase 13e): recorded evidence only, units spelled out.

Small models misread raw fractions, so every ratio is given in percent (`...Pct`) and money in
INR. Nothing here computes new results; it reads the stored record.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def pct(value: Optional[float], digits: int = 2) -> Optional[float]:
    return None if value is None else round(value * 100, digits)


def inr(value: Optional[float]) -> Optional[float]:
    return None if value is None else round(float(value), 0)


def _metrics_pct(metrics: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "totalReturnPct": pct(metrics.get("totalReturn")),
        "cagrPct": pct(metrics.get("cagr")),
        "maxDrawdownPct": pct(metrics.get("maxDrawdown")),
        "volatilityPct": pct(metrics.get("volatility")),
        "sharpe": None if metrics.get("sharpe") is None else round(metrics["sharpe"], 2),
    }


def run_list_item(item: Dict[str, Any]) -> Dict[str, Any]:
    out = {"id": item["id"], "kind": item["kind"], "label": item["label"], "createdAt": item.get("createdAt"), "period": item.get("period")}
    if item.get("kind") == "run":
        headline = item.get("headline", {})
        out |= {
            "strategy": item.get("strategy"),
            "universe": (item.get("dataset") or {}).get("universe"),
            "survivorshipBiased": (item.get("dataset") or {}).get("survivorshipBiased"),
            "costMultiplier": item.get("costMultiplier"),
            "totalReturnPct": pct(headline.get("totalReturn")),
            "cagrPct": pct(headline.get("cagr")),
            "maxDrawdownPct": pct(headline.get("maxDrawdown")),
            "chargesInr": inr(headline.get("totalCosts")),
            "partOfComparison": item.get("comparisonId"),
        }
    else:
        out["runs"] = item.get("runs")
    return out


def run_report(record: Dict[str, Any]) -> Dict[str, Any]:
    if record.get("kind") == "comparison":
        return {
            "id": record["id"],
            "kind": "comparison",
            "universe": record["dataset"]["universe"],
            "survivorshipBiased": record["dataset"]["survivorshipBiased"],
            "period": record["period"],
            "capitalInr": inr(record["settings"]["capital"]),
            "costStressMultiplier": record.get("costStress"),
            "rows": [
                {
                    "runId": row["runId"],
                    "label": row["label"],
                    "maturity": row["maturity"],
                    "costMultiplier": row["costMultiplier"],
                    **_metrics_pct(row.get("metrics", {})),
                    "annualTurnover": None if row["headline"].get("annualTurnover") is None else round(row["headline"]["annualTurnover"], 2),
                    "chargesInr": inr(row["headline"].get("totalCosts")),
                }
                for row in record["rows"]
            ],
            "indexLevel": {"symbol": record["benchmark"]["symbol"], **_metrics_pct(record["benchmark"].get("metrics") or {}), "note": "price index: no dividends, no costs, not tradable"},
            "caveats": record.get("caveats", []),
        }
    summary = record["summary"]
    return {
        "id": record["id"],
        "kind": "run",
        "label": record["label"],
        "strategy": {"id": record["strategy"]["id"], "name": record["strategy"]["name"], "params": record["strategy"]["params"], "maturity": record["strategy"]["metadata"].get("maturity"), "rebalance": record["strategy"]["metadata"].get("rebalance")},
        "universe": record["dataset"]["universe"],
        "survivorshipBiased": record["dataset"]["survivorshipBiased"],
        "period": record["period"],
        "capitalInr": inr(summary["startingCapital"]),
        "finalEquityInr": inr(summary["finalEquity"]),
        **_metrics_pct(record.get("metrics", {})),
        "index": {"symbol": record["benchmark"]["symbol"], **_metrics_pct(record["benchmark"].get("metrics") or {}), "note": "price index: no dividends, no costs"},
        "annualTurnover": round(summary["annualTurnover"], 2),
        "averageInvestedPct": pct(summary["averageExposure"], 1),
        "chargesInr": inr(summary["totalCosts"]),
        "chargesBreakdownInr": {key: inr(value) for key, value in summary["costBreakdown"].items()},
        "dividendsInr": inr(summary["dividends"]),
        "fills": summary["fills"],
        "costMultiplier": record.get("costMultiplier"),
        "assumptions": record.get("assumptions"),
        "caveats": record.get("caveats", []),
        "replay": {"identical": record["lastReplay"].get("identical"), "checkedAt": record["lastReplay"].get("checkedAt")} if record.get("lastReplay") else None,
        "comparisonId": record.get("comparisonId"),
        "note": "Pass comparisonId to get_research_run to see the equal-weight baseline and the cost-stress rerun on identical settings." if record.get("comparisonId") else None,
    }


def explain_position(record: Dict[str, Any], symbol: str, on: Optional[str] = None) -> Dict[str, Any]:
    """Every recorded fact about one stock in one run around a date: fills with their reasons, the
    target weight it had at each decision, shares held, and blocked orders."""
    symbol = symbol.upper()
    target = on or record["period"]["end"]
    fills = [f for f in record.get("fills", []) if f["symbol"] == symbol]
    before = [f for f in fills if f["date"] <= target][-6:]
    after = [f for f in fills if f["date"] > target][:2]
    decisions: List[Dict[str, Any]] = []
    for decision in record.get("decisions", []):
        if decision["date"] > target:
            break
        weight = dict(decision["weights"]).get(symbol)
        decisions.append({"date": decision["date"], "targetWeightPct": pct(weight) if weight else 0.0})
    held = None
    for entry in record.get("holdings", []):
        if entry["date"] > target:
            break
        held = {"asOf": entry["date"], "shares": dict(entry["positions"]).get(symbol, 0)}
    events = [e for e in record.get("orderEvents", []) if e["symbol"] == symbol and e["date"] <= target][-5:]
    found = bool(fills or any(d["targetWeightPct"] for d in decisions) or (held and held["shares"]))
    return {
        "runId": record["id"],
        "symbol": symbol,
        "asOf": target,
        "everHeldOrTargeted": found,
        "fills": [
            {"date": f["date"], "side": f["side"], "shares": f["shares"], "priceInr": round(f["price"], 2), "chargesInr": inr(f["costTotal"]), "decidedOn": f["decidedOn"], "reason": f["reason"]}
            for f in before + after
        ],
        "recentTargetWeights": decisions[-4:],
        "holding": held,
        "blockedOrders": events,
        "note": "Reasons were recorded by the strategy at each decision; fills happen at the next session's open with slippage and charges.",
        "fillsTruncated": record.get("fillsTotal", 0) > len(record.get("fills", [])),
    }


def ranking_summary(item: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": item["id"],
        "createdAt": item.get("createdAt"),
        "universe": (item.get("dataset") or {}).get("universe"),
        "holdoutUses": item.get("holdoutUses"),
        "models": {
            kind: {"name": family.get("name"), "maturity": family.get("maturity"), "validationMeanRankIc": None if family.get("validationMeanIc") is None else round(family["validationMeanIc"], 4), "trainingCutoff": family.get("trainingCutoff")}
            for kind, family in (item.get("families") or {}).items()
        },
        "note": "Rank IC is the correlation between predicted and realised ranks (0 = no skill). A model is 'validated' only if prespecified holdout criteria passed.",
    }
