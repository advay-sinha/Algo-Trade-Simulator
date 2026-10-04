"""Optional MLflow experiment tracking over the MLflow REST API (no mlflow package needed).

Works with any MLflow tracking server, including a free hosted DagsHub repository:
  MLFLOW_TRACKING_URI=https://dagshub.com/<user>/<repo>.mlflow
  MLFLOW_TRACKING_USERNAME=<user>   MLFLOW_TRACKING_PASSWORD=<token>
When MLFLOW_TRACKING_URI is unset this is a no-op. Failures are logged and never break training.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

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


def _experiment_id(session: requests.Session) -> str:
    name = settings.mlflow_experiment_name
    response = session.get(_api("experiments/get-by-name"), params={"experiment_name": name}, timeout=TIMEOUT_SECONDS)
    if response.status_code == 200:
        return response.json()["experiment"]["experiment_id"]
    created = session.post(_api("experiments/create"), json={"name": name}, timeout=TIMEOUT_SECONDS)
    created.raise_for_status()
    return created.json()["experiment_id"]


def log_training_run(run_name: str, params: Dict[str, Any], metrics: Dict[str, Optional[float]], tags: Dict[str, str]) -> Optional[Dict[str, str]]:
    """Blocking (call via asyncio.to_thread). Returns {runId, url} or None."""
    if not enabled():
        return None
    try:
        session = _session()
        experiment_id = _experiment_id(session)
        started = int(time.time() * 1000)
        run = session.post(
            _api("runs/create"),
            json={"experiment_id": experiment_id, "run_name": run_name, "start_time": started, "tags": [{"key": k, "value": v} for k, v in tags.items()]},
            timeout=TIMEOUT_SECONDS,
        )
        run.raise_for_status()
        run_id = run.json()["run"]["info"]["run_id"]
        batch = {
            "run_id": run_id,
            "params": [{"key": key, "value": str(value)[:500]} for key, value in params.items()],
            "metrics": [{"key": key, "value": float(value), "timestamp": started, "step": 0} for key, value in metrics.items() if value is not None],
        }
        session.post(_api("runs/log-batch"), json=batch, timeout=TIMEOUT_SECONDS).raise_for_status()
        session.post(_api("runs/update"), json={"run_id": run_id, "status": "FINISHED", "end_time": int(time.time() * 1000)}, timeout=TIMEOUT_SECONDS)
        base = settings.mlflow_tracking_uri.rstrip("/")
        return {"runId": run_id, "url": f"{base}/#/experiments/{experiment_id}/runs/{run_id}"}
    except Exception as exc:  # noqa: BLE001 - tracking is best-effort
        logger.warning("MLflow logging failed (%s); the model was still trained and saved", type(exc).__name__)
        return None
