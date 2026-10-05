"""Traceability for research runs (Phase 13c): artifacts, MLflow logging, deterministic replay.

Every run record carries a manifest (code commit, dataset version, window, strategy + params,
engine version and hashes, fee schedule versions used, cost multiplier, trial index). The same
record yields the artifact files (config, equity, fills, holdings, decisions) whose sha256 hashes
sit in the manifest; they are uploaded to MLflow when the tracking server proxies artifacts and
can always be downloaded from the API. Replay recomputes a run from its stored configuration and
the immutable snapshot and reports whether the result is identical.
"""

from __future__ import annotations

import asyncio
import csv
import hashlib
import io
import json
import logging
import zipfile
from typing import Any, Dict, List, Optional, Tuple

from backend.models.research_runs import RunSettings, StrategySpec
from backend.services import experiment_tracking
from backend.services.clock import now
from backend.services.portfolio_engine import ENGINE_VERSION

logger = logging.getLogger("algo_trade_backend.run_tracking")


def family(record: Dict[str, Any]) -> str:
    strategy = record.get("strategy", {})
    group = "baselines" if strategy.get("metadata", {}).get("maturity") == "baseline" else "rules"
    return f"{group}/{strategy.get('id', 'unknown')}"


def _csv(header: List[str], rows: List[List[Any]]) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(header)
    writer.writerows(rows)
    return buffer.getvalue().encode()


def build_artifacts(record: Dict[str, Any]) -> Dict[str, bytes]:
    manifest = {key: value for key, value in record.get("manifest", {}).items() if key != "artifacts"}
    config = {
        "label": record.get("label"),
        "strategy": {"id": record["strategy"]["id"], "params": record["strategy"]["params"]},
        "settings": record.get("settings"),
        "tolerance": record.get("tolerance"),
        "costMultiplier": record.get("costMultiplier"),
        "manifest": manifest,
        "assumptions": record.get("assumptions"),
    }
    return {
        "config.json": json.dumps(config, sort_keys=True, indent=1, default=str).encode(),
        "equity.csv": _csv(["timestamp", "equity_inr"], [[p["timestamp"], p["value"]] for p in record["series"]["equity"]]),
        "fills.csv": _csv(
            ["date", "symbol", "side", "shares", "price", "notional", "charges", "realised_pnl", "decided_on", "fee_version", "reason"],
            [[f["date"], f["symbol"], f["side"], f["shares"], f["price"], f["notional"], f["costTotal"], f.get("realisedPnl"), f["decidedOn"], f.get("feeVersion"), f["reason"]] for f in record.get("fills", [])],
        ),
        "holdings.csv": _csv(["date", "symbol", "shares"], [[h["date"], symbol, shares] for h in record.get("holdings", []) for symbol, shares in h["positions"]]),
        "decisions.csv": _csv(["date", "symbol", "target_weight"], [[d["date"], symbol, weight] for d in record.get("decisions", []) for symbol, weight in d["weights"]]),
    }


def attach_artifact_hashes(record: Dict[str, Any]) -> Dict[str, Any]:
    record.setdefault("manifest", {})["artifacts"] = {name: hashlib.sha256(data).hexdigest() for name, data in build_artifacts(record).items()}
    return record


def zip_artifacts(record: Dict[str, Any]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in build_artifacts(record).items():
            archive.writestr(name, data)
    return buffer.getvalue()


def tracking_payload(record: Dict[str, Any]) -> Tuple[str, Dict[str, Any], Dict[str, Optional[float]], Dict[str, str]]:
    manifest = record.get("manifest", {})
    params: Dict[str, Any] = {f"param.{key}": value for key, value in record["strategy"]["params"].items()}
    settings = record.get("settings", {})
    for key in ("start", "end", "capital", "feeSchedule", "brokerage", "slippageBps", "participationCap", "minMedianTradedValueInr", "priceFloor", "riskFreeRate"):
        params[f"settings.{key}"] = settings.get(key)
    params |= {"strategy.id": record["strategy"]["id"], "cost.multiplier": record.get("costMultiplier"), "tolerance": record.get("tolerance")}
    metrics = dict(record.get("metrics", {}))
    summary = record.get("summary", {})
    for key in ("annualTurnover", "totalCosts", "dividends", "averageExposure", "fills"):
        metrics[key] = summary.get(key)
    metrics["benchmark.excessReturn"] = record.get("benchmark", {}).get("excessReturn")
    code = manifest.get("code", {})
    trial = manifest.get("trial", {})
    tags = {
        "app.run_id": record.get("id", ""),
        "app.kind": "research-run",
        "code.commit": str(code.get("commit", "unknown")),
        "code.dirty": str(code.get("dirty", False)).lower(),
        "dataset.version": record["dataset"]["version"],
        "dataset.universe": record["dataset"]["universe"],
        "dataset.survivorship_biased": str(record["dataset"].get("survivorshipBiased", True)).lower(),
        "engine.version": str(record.get("engineVersion")),
        "config.hash": record.get("configHash", ""),
        "result.hash": record.get("resultHash", ""),
        "strategy.maturity": record["strategy"]["metadata"].get("maturity", ""),
        "fee.versions": ",".join(manifest.get("costs", {}).get("feeVersions", [])),
        "trial.index": str(trial.get("index", 1)),
        "trial.count": str(trial.get("count", 1)),
        "seed": "none (rule-based)",
    }
    for name, digest in manifest.get("artifacts", {}).items():
        tags[f"artifact.{name}.sha256"] = digest
    return record.get("label", "research run"), params, metrics, tags


async def track(store: Any, user_id: str, record: Dict[str, Any]) -> Dict[str, Any]:
    """Log one stored run to MLflow (best effort) and save the outcome on the record."""
    if not experiment_tracking.enabled():
        tracking: Dict[str, Any] = {"enabled": False}
    else:
        run_name, params, metrics, tags = tracking_payload(record)
        logged = await asyncio.to_thread(experiment_tracking.log_run, run_name, params, metrics, tags, family=family(record), artifacts=build_artifacts(record))
        tracking = {"enabled": True, "logged": logged is not None} | (logged or {})
    await store.set_research_run_fields(user_id, record["id"], {"tracking": tracking})
    record["tracking"] = tracking
    return tracking


async def track_many(store: Any, user_id: str, records: List[Dict[str, Any]]) -> None:
    await asyncio.gather(*(track(store, user_id, record) for record in records))


async def replay(store: Any, user_id: str, record: Dict[str, Any]) -> Dict[str, Any]:
    """Recompute a stored run from its configuration and dataset; report identity, never pass silently."""
    from backend.services import research_runs  # local import: research_runs imports this module

    checked = now().isoformat()
    if record.get("kind") != "run":
        raise research_runs.RunError("Only single runs can be replayed; replay the runs inside a comparison one by one")
    if record.get("engineVersion") != ENGINE_VERSION:
        outcome = {
            "identical": False,
            "replayed": False,
            "reason": f"The run was made with engine v{record.get('engineVersion')}; the current engine is v{ENGINE_VERSION}, so an identical replay isn't possible.",
            "checkedAt": checked,
        }
    else:
        snapshot = await research_runs.load(store, record["dataset"]["version"])
        settings = RunSettings(**{key: value for key, value in record["settings"].items() if key in RunSettings.model_fields})
        spec = StrategySpec(strategy=record["strategy"]["id"], params=record["strategy"]["params"], tolerance=record.get("tolerance"))
        fresh = await asyncio.to_thread(research_runs.execute, snapshot, settings, spec, cost_multiplier=record.get("costMultiplier", 1.0))
        stored_equity = [p["value"] for p in record["series"]["equity"]]
        fresh_equity = [p["value"] for p in fresh["series"]["equity"]]
        max_diff = max((abs(a - b) for a, b in zip(stored_equity, fresh_equity)), default=0.0) if len(stored_equity) == len(fresh_equity) else None
        identical = fresh["resultHash"] == record.get("resultHash")
        outcome = {
            "identical": identical,
            "replayed": True,
            "resultHash": fresh["resultHash"],
            "storedResultHash": record.get("resultHash"),
            "configHashMatches": fresh["configHash"] == record.get("configHash"),
            "maxAbsEquityDiff": max_diff,
            "reason": None if identical else ("Equity series lengths differ" if max_diff is None else "Results differ from the stored run"),
            "checkedAt": checked,
        }
    await store.set_research_run_fields(user_id, record["id"], {"lastReplay": outcome})
    return outcome
