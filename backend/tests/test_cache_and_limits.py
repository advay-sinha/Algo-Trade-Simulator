"""Market-data cache and rate-limit storage: memory backends and Upstash REST (fake local server)."""

import asyncio
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from backend.services import market_data_service as market
from backend.services import rate_limiter, upstash


class _FakeUpstash(BaseHTTPRequestHandler):
    store: dict = {}
    fail = False

    def log_message(self, *args):
        pass

    def _reply(self, body, status=200):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _run(self, cmd):
        name = cmd[0].upper()
        if name == "GET":
            return self.store.get(cmd[1])
        if name == "SET":
            self.store[cmd[1]] = cmd[2]
            return "OK"
        if name == "INCR":
            self.store[cmd[1]] = int(self.store.get(cmd[1], 0)) + 1
            return self.store[cmd[1]]
        if name == "EXPIRE":
            return 1
        return None

    def do_POST(self):
        assert self.headers.get("Authorization") == "Bearer test-token"
        if _FakeUpstash.fail:
            self._reply({"error": "boom"}, 500)
            return
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path.endswith("/pipeline"):
            self._reply([{"result": self._run(cmd)} for cmd in body])
        else:
            self._reply({"result": self._run(body)})


def _with_fake_upstash(fn):
    server = HTTPServer(("127.0.0.1", 0), _FakeUpstash)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    saved = {k: os.environ.get(k) for k in ("UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN")}
    os.environ["UPSTASH_REDIS_REST_URL"] = f"http://127.0.0.1:{server.server_port}"
    os.environ["UPSTASH_REDIS_REST_TOKEN"] = "test-token"
    _FakeUpstash.store, _FakeUpstash.fail = {}, False
    try:
        return fn()
    finally:
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        server.shutdown()


def test_memory_cache_helpers_round_trip():
    saved = market._cache
    market._cache = market.MemoryTTLCache()
    try:
        asyncio.run(market._cache_set("k", {"source": "live", "v": 1}, 30))
        assert asyncio.run(market._cache_get("k")) == {"source": "live", "v": 1}
        assert asyncio.run(market._cache_get("missing")) is None
    finally:
        market._cache = saved


def test_only_live_payloads_are_cached():
    assert market._cacheable({"source": "live"})
    assert not market._cacheable({"source": "offline"})
    assert not market._cacheable([{"source": "live"}, {"source": "synthetic"}])


def test_upstash_cache_round_trip_and_fail_open():
    def scenario():
        assert upstash.configured()
        cache = market.UpstashCache()
        cache.set("chart:AAPL", {"source": "live", "points": [1, 2]}, 60)
        assert cache.get("chart:AAPL") == {"source": "live", "points": [1, 2]}
        _FakeUpstash.fail = True
        assert cache.get("chart:AAPL") is None  # outage -> miss, not an exception
        cache.set("x", {"a": 1}, 5)  # outage -> silently skipped

    _with_fake_upstash(scenario)


def test_shared_rate_limits_count_across_calls_and_fail_open():
    def scenario():
        storage = rate_limiter.build_storage("")
        assert isinstance(storage, rate_limiter.UpstashRateLimitStorage)
        counts = [storage.hit("auth-login:1.2.3.4", 60)[0] for _ in range(3)]
        assert counts == [1, 2, 3]
        _FakeUpstash.fail = True
        assert storage.hit("auth-login:1.2.3.4", 60)[0] == 0  # fail open
        assert isinstance(rate_limiter.build_storage("memory://"), rate_limiter.MemoryRateLimitStorage)

    _with_fake_upstash(scenario)


def test_memory_storage_without_upstash():
    assert isinstance(rate_limiter.build_storage(""), rate_limiter.MemoryRateLimitStorage)


def test_client_ip_trusts_forwarded_header_only_when_configured():
    from starlette.requests import Request

    from backend.config import settings
    from backend.services.rate_limiter import client_ip

    request = Request({"type": "http", "headers": [(b"x-forwarded-for", b"203.0.113.7, 10.0.0.2")], "client": ("10.0.0.9", 1234)})
    saved = settings.trust_proxy_headers
    try:
        settings.trust_proxy_headers = False
        assert client_ip(request) == "10.0.0.9"  # local: the header could be spoofed
        settings.trust_proxy_headers = True
        assert client_ip(request) == "203.0.113.7"  # behind the hosting proxy: first hop is the client
    finally:
        settings.trust_proxy_headers = saved
