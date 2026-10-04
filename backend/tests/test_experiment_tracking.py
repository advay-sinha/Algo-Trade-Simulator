"""MLflow REST logging against a local fake tracking server (no external network)."""

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from backend.config import settings
from backend.services import experiment_tracking


class _FakeMlflow(BaseHTTPRequestHandler):
    calls: list = []

    def log_message(self, *args):  # silence test output
        pass

    def _reply(self, status, body):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        _FakeMlflow.calls.append(("GET", self.path, self.headers.get("Authorization")))
        if self.path.startswith("/api/2.0/mlflow/experiments/get-by-name"):
            self._reply(404, {"error_code": "RESOURCE_DOES_NOT_EXIST"})
        else:
            self._reply(404, {})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        _FakeMlflow.calls.append(("POST", self.path, body))
        if self.path.endswith("/experiments/create"):
            self._reply(200, {"experiment_id": "7"})
        elif self.path.endswith("/runs/create"):
            self._reply(200, {"run": {"info": {"run_id": "abc123"}}})
        else:
            self._reply(200, {})


def _with_server(fn):
    server = HTTPServer(("127.0.0.1", 0), _FakeMlflow)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    saved = (settings.mlflow_tracking_uri, settings.mlflow_tracking_username, settings.mlflow_tracking_password)
    try:
        settings.mlflow_tracking_uri = f"http://127.0.0.1:{server.server_port}"
        settings.mlflow_tracking_username = "user"
        settings.mlflow_tracking_password = "token"
        _FakeMlflow.calls = []
        return fn()
    finally:
        settings.mlflow_tracking_uri, settings.mlflow_tracking_username, settings.mlflow_tracking_password = saved
        server.shutdown()


def test_disabled_without_tracking_uri():
    saved = settings.mlflow_tracking_uri
    settings.mlflow_tracking_uri = None
    try:
        assert experiment_tracking.enabled() is False
        assert experiment_tracking.log_training_run("x", {}, {}, {}) is None
    finally:
        settings.mlflow_tracking_uri = saved


def test_logs_run_params_and_metrics():
    def scenario():
        result = experiment_tracking.log_training_run("AAPL-logistic", {"model": "logistic"}, {"accuracy": 0.51, "roc_auc": None}, {"source": "test"})
        assert result["runId"] == "abc123" and "/experiments/7/runs/abc123" in result["url"]
        paths = [call[1] for call in _FakeMlflow.calls]
        assert any(p.endswith("/experiments/create") for p in paths)
        batch = next(call[2] for call in _FakeMlflow.calls if call[1].endswith("/runs/log-batch"))
        assert batch["params"] == [{"key": "model", "value": "logistic"}]
        assert [m["key"] for m in batch["metrics"]] == ["accuracy"]  # None metrics are skipped
        auth = next(call[2] for call in _FakeMlflow.calls if call[0] == "GET")
        assert auth and auth.startswith("Basic ")

    _with_server(scenario)


def test_tracking_failure_never_raises():
    saved = settings.mlflow_tracking_uri
    settings.mlflow_tracking_uri = "http://127.0.0.1:9"  # nothing listens here
    try:
        assert experiment_tracking.log_training_run("x", {}, {"a": 1.0}, {}) is None
    finally:
        settings.mlflow_tracking_uri = saved
