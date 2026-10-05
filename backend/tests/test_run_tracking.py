"""Phase 13c: run manifests, artifacts, MLflow logging per family, replay (no external network)."""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import threading
import zipfile
from http.server import BaseHTTPRequestHandler, HTTPServer

from fastapi.testclient import TestClient

from backend.config import settings
from backend.deps import get_store
from backend.main import app
from backend.research import snapshots
from backend.research.snapshots import build_snapshot
from backend.services import experiment_tracking, rate_limiter, run_tracking
from backend.tests.helpers import make_panel_frames


class _FakeMlflow(BaseHTTPRequestHandler):
    calls: list = []
    experiments: dict = {}
    proxied = True

    def log_message(self, *args):
        pass

    def _reply(self, status, body):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        _FakeMlflow.calls.append(("GET", self.path, None))
        if self.path.startswith("/api/2.0/mlflow/experiments/get-by-name"):
            name = self.path.split("experiment_name=")[1]
            from urllib.parse import unquote_plus

            name = unquote_plus(name)
            if name in _FakeMlflow.experiments:
                self._reply(200, {"experiment": {"experiment_id": _FakeMlflow.experiments[name]}})
            else:
                self._reply(404, {"error_code": "RESOURCE_DOES_NOT_EXIST"})
        else:
            self._reply(404, {})

    def do_PUT(self):
        length = int(self.headers.get("Content-Length", 0))
        data = self.rfile.read(length)
        _FakeMlflow.calls.append(("PUT", self.path, hashlib.sha256(data).hexdigest()))
        self._reply(200, {})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        _FakeMlflow.calls.append(("POST", self.path, body))
        if self.path.endswith("/experiments/create"):
            experiment_id = str(len(_FakeMlflow.experiments) + 10)
            _FakeMlflow.experiments[body["name"]] = experiment_id
            self._reply(200, {"experiment_id": experiment_id})
        elif self.path.endswith("/runs/create"):
            run_id = f"run{sum(1 for c in _FakeMlflow.calls if c[1].endswith('/runs/create'))}"
            uri = f"mlflow-artifacts:/{body['experiment_id']}/{run_id}/artifacts" if _FakeMlflow.proxied else f"s3://bucket/{run_id}/artifacts"
            self._reply(200, {"run": {"info": {"run_id": run_id, "artifact_uri": uri}}})
        elif self.path.endswith("/registered-models/create"):
            self._reply(200, {"registered_model": {"name": body["name"]}})
        elif self.path.endswith("/model-versions/create"):
            self._reply(200, {"model_version": {"version": "3"}})
        else:
            self._reply(200, {})


def _with_mlflow(fn, proxied=True):
    server = HTTPServer(("127.0.0.1", 0), _FakeMlflow)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    saved = (settings.mlflow_tracking_uri, settings.mlflow_tracking_username, settings.mlflow_tracking_password, settings.mlflow_experiment_name)
    try:
        settings.mlflow_tracking_uri = f"http://127.0.0.1:{server.server_port}"
        settings.mlflow_tracking_username, settings.mlflow_tracking_password = "user", "token"
        settings.mlflow_experiment_name = "atl"
        _FakeMlflow.calls, _FakeMlflow.experiments, _FakeMlflow.proxied = [], {}, proxied
        return fn()
    finally:
        settings.mlflow_tracking_uri, settings.mlflow_tracking_username, settings.mlflow_tracking_password, settings.mlflow_experiment_name = saved
        server.shutdown()


def _snapshot():
    frames, bench, _ = make_panel_frames(("AAA.NS", "BBB.NS", "CCC.NS", "DDD.NS"), n=420)
    return build_snapshot(frames, bench, universe="test", benchmark_symbol="^TEST", source="synthetic", downloaded_at="2026-01-01T00:00:00+00:00", survivorship_biased=True, caveats=["Synthetic."])


def _client_with_dataset(email):
    rate_limiter.reset()
    client = TestClient(app)
    signup = client.post("/api/auth/signup", json={"email": email, "password": "Tr1cky-Horse-42", "name": "T"})
    headers = {"Authorization": f"Bearer {signup.json()['token']}"}
    snap = _snapshot()

    async def save():
        await snapshots.save_snapshot(await get_store(), snap)

    asyncio.run(save())
    settings_body = {"datasetVersion": snap.version, "capital": 2_000_000, "minMedianTradedValueInr": 0, "priceFloor": 0}
    return client, headers, settings_body


def test_manifest_artifacts_export_and_replay():
    client, headers, body = _client_with_dataset("rt-manifest@example.com")
    run = client.post("/api/research-runs", headers=headers, json=body | {"strategy": "xs-momentum", "params": {"lookback": 126, "holdings": 2, "maxWeight": 0.6, "sectorCap": 1.0}}).json()
    manifest = run["manifest"]
    assert manifest["dataset"]["version"] == body["datasetVersion"] and manifest["engine"]["version"] == 2
    assert manifest["code"]["commit"] and manifest["trial"] == {"index": 1, "count": 1} and manifest["seed"] is None
    assert manifest["costs"]["feeVersions"] and manifest["dataset"]["sectorCatalog"]
    assert set(manifest["artifacts"]) == {"config.json", "equity.csv", "fills.csv", "holdings.csv", "decisions.csv"}
    assert run["tracking"] == {"enabled": False}

    export = client.get(f"/api/research-runs/{run['id']}/export", headers=headers)
    assert export.status_code == 200 and export.headers["content-type"] == "application/zip"
    with zipfile.ZipFile(io.BytesIO(export.content)) as archive:
        for name, digest in manifest["artifacts"].items():
            assert hashlib.sha256(archive.read(name)).hexdigest() == digest, name
        fills_csv = archive.read("fills.csv").decode()
        assert fills_csv.startswith("date,symbol,side") and "Rank" in fills_csv

    replay = client.post(f"/api/research-runs/{run['id']}/replay", headers=headers).json()
    assert replay["identical"] is True and replay["maxAbsEquityDiff"] == 0 and replay["configHashMatches"]
    assert client.get(f"/api/research-runs/{run['id']}", headers=headers).json()["lastReplay"]["identical"] is True


def test_replay_reports_mismatches_instead_of_passing():
    client, headers, body = _client_with_dataset("rt-mismatch@example.com")
    run = client.post("/api/research-runs", headers=headers, json=body | {"strategy": "equal-weight-universe"}).json()

    async def tamper(fields):  # simulate a stored record that no longer matches (in-memory store)
        (await get_store()).research_runs[run["id"]].update(fields)

    asyncio.run(tamper({"resultHash": "0" * 64}))
    mismatch = client.post(f"/api/research-runs/{run['id']}/replay", headers=headers).json()
    assert mismatch["identical"] is False and mismatch["reason"]
    asyncio.run(tamper({"engineVersion": 1}))
    old = client.post(f"/api/research-runs/{run['id']}/replay", headers=headers).json()
    assert old["identical"] is False and old["replayed"] is False and "engine v1" in old["reason"]


def test_comparison_logs_each_run_to_its_family_with_artifacts():
    def scenario():
        client, headers, body = _client_with_dataset("rt-mlflow@example.com")
        comparison = client.post("/api/research-runs/compare", headers=headers, json=body | {"strategies": [{"strategy": "vol-trend"}]}).json()
        assert comparison["tracking"] == {"enabled": True, "logged": 3, "runs": 3}
        assert set(_FakeMlflow.experiments) == {"atl/rules/vol-trend", "atl/baselines/equal-weight-universe"}
        creates = [c[2] for c in _FakeMlflow.calls if c[1].endswith("/runs/create")]
        tags = {tag["key"]: tag["value"] for tag in creates[0]["tags"]}
        assert tags["dataset.version"] == body["datasetVersion"] and tags["engine.version"] == "2" and tags["trial.count"] == "3"
        assert tags["code.commit"] and tags["seed"].startswith("none")
        puts = [c for c in _FakeMlflow.calls if c[0] == "PUT"]
        assert len(puts) == 15 and all("/api/2.0/mlflow-artifacts/artifacts/" in c[1] for c in puts)
        run = client.get(f"/api/research-runs/{comparison['rows'][0]['runId']}", headers=headers).json()
        assert run["tracking"]["logged"] and len(run["tracking"]["artifactsUploaded"]) == 5
        uploaded = {c[1].rsplit("/", 1)[1]: c[2] for c in puts if f"/{run['tracking']['runId']}/" in c[1]}
        assert uploaded == run["manifest"]["artifacts"]  # what MLflow got is what the manifest says

    _with_mlflow(scenario)


def test_unproxied_artifact_store_skips_uploads_but_keeps_hashes():
    def scenario():
        client, headers, body = _client_with_dataset("rt-s3@example.com")
        run = client.post("/api/research-runs", headers=headers, json=body | {"strategy": "equal-weight-universe"}).json()
        assert run["tracking"]["logged"] and run["tracking"]["artifactsUploaded"] == []
        assert not [c for c in _FakeMlflow.calls if c[0] == "PUT"] and run["manifest"]["artifacts"]

    _with_mlflow(scenario, proxied=False)


def test_tracking_outage_never_breaks_a_run():
    saved = settings.mlflow_tracking_uri
    settings.mlflow_tracking_uri = "http://127.0.0.1:9"
    try:
        client, headers, body = _client_with_dataset("rt-down@example.com")
        response = client.post("/api/research-runs", headers=headers, json=body | {"strategy": "equal-weight-universe"})
        assert response.status_code == 200 and response.json()["tracking"] == {"enabled": True, "logged": False}
    finally:
        settings.mlflow_tracking_uri = saved


def test_register_model_version_best_effort():
    def scenario():
        result = experiment_tracking.register_model_version("atl-ranking", "run1", "mlflow-artifacts:/1/run1/artifacts/model.joblib")
        assert result == {"name": "atl-ranking", "version": "3"}

    _with_mlflow(scenario)
    assert experiment_tracking.register_model_version("x", "y", "z") is None  # tracking off in tests


def test_family_names():
    assert run_tracking.family({"strategy": {"id": "xs-momentum", "metadata": {"maturity": "research"}}}) == "rules/xs-momentum"
    assert run_tracking.family({"strategy": {"id": "equal-weight-universe", "metadata": {"maturity": "baseline"}}}) == "baselines/equal-weight-universe"
