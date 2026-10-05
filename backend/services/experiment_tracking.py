"""Optional MLflow experiment tracking over the MLflow REST API (no mlflow package needed).

Works with any MLflow tracking server, including a free hosted DagsHub repository:
  MLFLOW_TRACKING_URI=https://dagshub.com/<user>/<repo>.mlflow
  MLFLOW_TRACKING_USERNAME=<user>   MLFLOW_TRACKING_PASSWORD=<token>
When MLFLOW_TRACKING_URI is unset this is a no-op. Failures are logged and never break training.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

from backend.config import settings

logger = logging.getLogger("algo_trade_backend.mlflow")
TIMEOUT_SECONDS = 6


def enabled() -> bool:
    return bool(settings.mlflow_tracking_uri)


def _session() -> requests.Session:
    session = requests.Session()
    if settings.mlflow_tracking_username and settings.mlflow_tracking_password:
        session.auth = (settings.mlflow_tracking_username, settings.mlflow_tracking_password)
    return session


def _api(path: str) -> str:
    return f"{settings.mlflow_tracking_uri.rstrip('/')}/api/2.0/mlflow/{path}"


def experiment_name(family: Optional[str] = None) -> str:
    """Root experiment (MLFLOW_EXPERIMENT_NAME) or a per-family child such as `<root>/rules/xs-momentum`."""
    root = settings.mlflow_experiment_name
    return f"{root}/{family}" if family else root


def _experiment_id(session: requests.Session, name: Optional[str] = None) -> str:
    name = name or settings.mlflow_experiment_name
    response = session.get(_api("experiments/get-by-name"), params={"experiment_name": name}, timeout=TIMEOUT_SECONDS)
    if response.status_code == 200:
        return response.json()["experiment"]["experiment_id"]
    created = session.post(_api("experiments/create"), json={"name": name}, timeout=TIMEOUT_SECONDS)
    created.raise_for_status()
    return created.json()["experiment_id"]


def _artifact_url(artifact_uri: Optional[str], name: str) -> Optional[str]:
    """Upload URL through the tracking server's artifact proxy, when the run's store is proxied."""
    prefix = "mlflow-artifacts:/"
    if not artifact_uri or not artifact_uri.startswith(prefix):
        return None
    path = artifact_uri[len(prefix) :].strip("/")
    return f"{settings.mlflow_tracking_uri.rstrip('/')}/api/2.0/mlflow-artifacts/artifacts/{path}/{name}"


def _chunks(items: List[Dict[str, Any]], size: int) -> List[List[Dict[str, Any]]]:
    return [items[i : i + size] for i in range(0, len(items), size)] or [[]]


def log_run(
    run_name: str,
    params: Dict[str, Any],
    metrics: Dict[str, Optional[float]],
    tags: Dict[str, str],
    *,
    family: Optional[str] = None,
    step_metrics: Optional[List[Tuple[str, float, int]]] = None,
    artifacts: Optional[Dict[str, bytes]] = None,
) -> Optional[Dict[str, Any]]:
    """Blocking (call via asyncio.to_thread). Best effort: returns None on any failure.

    Returns {runId, url, experiment, artifactsUploaded: [names]}. Artifacts upload only when the
    server proxies artifacts (artifact URI `mlflow-artifacts:/...`); otherwise the caller keeps
    their hashes in its own record.
    """
    if not enabled():
        return None
    try:
        session = _session()
        name = experiment_name(family)
        experiment_id = _experiment_id(session, name)
        started = int(time.time() * 1000)
        run = session.post(
            _api("runs/create"),
            json={"experiment_id": experiment_id, "run_name": run_name, "start_time": started, "tags": [{"key": k, "value": str(v)[:5000]} for k, v in tags.items()]},
            timeout=TIMEOUT_SECONDS,
        )
        run.raise_for_status()
        info = run.json()["run"]["info"]
        run_id = info["run_id"]
        param_items = [{"key": key, "value": str(value)[:500]} for key, value in params.items()]
        metric_items = [{"key": key, "value": float(value), "timestamp": started, "step": 0} for key, value in metrics.items() if value is not None]
        metric_items += [{"key": key, "value": float(value), "timestamp": started, "step": int(step)} for key, value, step in (step_metrics or []) if value is not None]
        # MLflow limits one batch to 100 params and 1000 metrics.
        for index, params_chunk in enumerate(_chunks(param_items, 100)):
            for metrics_chunk in _chunks(metric_items, 1000) if index == 0 else [[]]:
                session.post(_api("runs/log-batch"), json={"run_id": run_id, "params": params_chunk, "metrics": metrics_chunk}, timeout=TIMEOUT_SECONDS).raise_for_status()
        uploaded: List[str] = []
        for artifact_name, data in (artifacts or {}).items():
            url = _artifact_url(info.get("artifact_uri"), artifact_name)
            if url is None:
                break
            response = session.put(url, data=data, timeout=TIMEOUT_SECONDS * 2)
            if response.status_code < 300:
                uploaded.append(artifact_name)
        session.post(_api("runs/update"), json={"run_id": run_id, "status": "FINISHED", "end_time": int(time.time() * 1000)}, timeout=TIMEOUT_SECONDS)
        base = settings.mlflow_tracking_uri.rstrip("/")
        return {"runId": run_id, "url": f"{base}/#/experiments/{experiment_id}/runs/{run_id}", "experiment": name, "artifactsUploaded": uploaded, "artifactUri": info.get("artifact_uri")}
    except Exception as exc:  # noqa: BLE001 - tracking is best-effort
        logger.warning("MLflow logging failed (%s); the run itself was saved", type(exc).__name__)
        return None


def register_model_version(model_name: str, run_id: str, source: str) -> Optional[Dict[str, Any]]:
    """Best effort: create the registered model if needed and add a version pointing at `source`."""
    if not enabled():
        return None
    try:
        session = _session()
        created = session.post(_api("registered-models/create"), json={"name": model_name}, timeout=TIMEOUT_SECONDS)
        if created.status_code >= 300 and "RESOURCE_ALREADY_EXISTS" not in created.text:
            created.raise_for_status()
        version = session.post(_api("model-versions/create"), json={"name": model_name, "source": source, "run_id": run_id}, timeout=TIMEOUT_SECONDS)
        version.raise_for_status()
        return {"name": model_name, "version": version.json().get("model_version", {}).get("version")}
    except Exception as exc:  # noqa: BLE001
        logger.warning("MLflow model registration failed (%s)", type(exc).__name__)
        return None


def log_training_run(run_name: str, params: Dict[str, Any], metrics: Dict[str, Optional[float]], tags: Dict[str, str]) -> Optional[Dict[str, str]]:
    """Blocking (call via asyncio.to_thread). Returns {runId, url} or None. (Single-symbol ML lab.)"""
    result = log_run(run_name, params, metrics, tags)
    return {"runId": result["runId"], "url": result["url"]} if result else None
