"""Smoke-test a deployed instance end to end through its public URL.

Usage:
  python scripts/smoke_deploy.py https://your-app.vercel.app        # through the Vercel rewrite
  python scripts/smoke_deploy.py https://user-space.hf.space        # the API directly

Creates a throwaway account (smoke-<random>@example.com) plus one backtest, and cleans up the
simulation and note it creates. Sentiment, research memory, and copilot steps run only when the
server reports them configured. Prints PASS/FAIL with timings; exit code 1 on any failure.
"""

from __future__ import annotations

import json
import sys
import time
import uuid
from typing import Any, Callable, List, Tuple

import requests

TIMEOUT = 120


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    base = sys.argv[1].rstrip("/") + "/api"
    session = requests.Session()
    results: List[Tuple[str, bool]] = []

    def step(name: str, fn: Callable[[], Any]) -> Any:
        started = time.perf_counter()
        try:
            detail = fn()
            ok = True
        except Exception as exc:  # noqa: BLE001
            detail, ok = f"{type(exc).__name__}: {exc}", False
        results.append((name, ok))
        text = "" if detail in (None, "") else (f"{len(detail)} fields" if isinstance(detail, dict) and len(str(detail)) > 220 else str(detail))
        print(f"{'PASS' if ok else 'FAIL'}  {name:30} {time.perf_counter() - started:6.2f}s  {text[:220]}", flush=True)
        return detail if ok else None

    def expect(response: requests.Response, code: int = 200) -> requests.Response:
        if response.status_code != code:
            raise AssertionError(f"HTTP {response.status_code}: {response.text[:160]}")
        return response

    def health() -> str:
        # Free instances sleep when idle; the first request may wait for a cold start.
        for _ in range(12):
            try:
                response = session.get(f"{base}/health", timeout=30)
                if response.ok:
                    return f"request id {response.headers.get('x-request-id', 'missing')}"
            except requests.RequestException:
                pass
            time.sleep(5)
        raise AssertionError("no healthy response within ~6 minutes")

    if step("health (wakes the instance)", health) is None:
        return 1

    email = f"smoke-{uuid.uuid4().hex[:10]}@example.com"
    password = "Smoke-" + uuid.uuid4().hex[:16]

    def signup() -> str:
        token = expect(session.post(f"{base}/auth/signup", json={"email": email, "password": password, "name": "Smoke test"}, timeout=TIMEOUT)).json()["token"]
        session.headers["Authorization"] = f"Bearer {token}"
        return email

    if step("signup", signup) is None:
        return 1
    status = step("status", lambda: expect(session.get(f"{base}/status", timeout=TIMEOUT)).json()) or {}
    if status:
        problems = []
        if status.get("store") != "mongo":
            problems.append(f"store is {status.get('store')} (expected mongo)")
        if status.get("devEndpoints"):
            problems.append("dev endpoints enabled")
        if not status.get("strictDb"):
            problems.append("strict database mode off")
        step("production settings", lambda: (_ for _ in ()).throw(AssertionError("; ".join(problems))) if problems else "mongo, strict, dev endpoints off")
    step("login", lambda: expect(session.post(f"{base}/auth/login", json={"email": email, "password": password}, timeout=TIMEOUT)) and "")
    sim = step("create simulation", lambda: expect(session.post(f"{base}/simulations", json={"symbol": "AAPL", "strategy": "sma-crossover", "startingCapital": 10000}, timeout=TIMEOUT)).json()["id"])
    if sim:
        step("delete simulation", lambda: expect(session.delete(f"{base}/simulations/{sim}", timeout=TIMEOUT), 204) and "")
    step("watchlist (data source)", lambda: {q["symbol"]: q["source"] for q in expect(session.get(f"{base}/market/watchlist", params={"symbols": "AAPL,MSFT"}, timeout=TIMEOUT)).json()})
    backtest = step("backtest 1y SMA", lambda: expect(session.post(f"{base}/backtest/run", json={"symbol": "AAPL", "strategy": "sma-crossover", "range": "1y"}, timeout=TIMEOUT)).json())
    if backtest:
        step("risk report", lambda: f"sharpe {expect(session.get(f'{base}/backtest/{backtest['id']}/risk', timeout=TIMEOUT)).json().get('metrics', {}).get('sharpe')}, data {backtest.get('dataSource')}")

    if (status.get("nlp") or {}).get("configured"):
        step("sentiment", lambda: [r["label"] for r in expect(session.post(f"{base}/research/sentiment", json={"texts": ["Company beats earnings, raises guidance"]}, timeout=TIMEOUT)).json()["results"]])
        note = step("save note", lambda: expect(session.post(f"{base}/research/notes", json={"title": "Smoke note", "body": "Volatility and drawdowns spiked during the selloff."}, timeout=TIMEOUT), 201).json())
        if note and not note.get("indexed"):
            results.append(("note indexed", False))
            print("FAIL  note indexed                       embedding missing — check HF_TOKEN on the server")
        step("semantic search", lambda: [(h["title"], h["score"]) for h in expect(session.post(f"{base}/research/rag/query", json={"query": "losses in turbulent markets", "k": 1}, timeout=TIMEOUT)).json()["hits"]])
        if note:
            step("delete note", lambda: expect(session.delete(f"{base}/research/notes/{note['id']}", timeout=TIMEOUT), 204) and "")
    else:
        print("SKIP  research NLP (not configured on the server)")

    if status.get("copilotConfigured"):
        def copilot() -> str:
            kinds, reply = [], ""
            with session.post(f"{base}/copilot/chat", json={"message": "What is AAPL trading at?", "history": []}, stream=True, timeout=TIMEOUT) as response:
                expect(response)
                for line in response.iter_lines(decode_unicode=True):
                    if line and line.startswith("data:"):
                        event = json.loads(line[5:])
                        kinds.append(event["type"])
                        if event["type"] == "error":
                            raise AssertionError(event["message"])
                        if event["type"] == "message":
                            reply += event["content"]
            if "done" not in kinds:
                raise AssertionError(f"stream ended early: {kinds}")
            return f"events {kinds[:6]} · {reply[:80]!r}"

        step("copilot (streaming)", copilot)
    else:
        print("SKIP  copilot (not configured on the server)")

    step("logout", lambda: expect(session.post(f"{base}/auth/logout", timeout=TIMEOUT), 204) and "")
    step("old token rejected", lambda: expect(session.get(f"{base}/simulations", timeout=TIMEOUT), 401).status_code)

    passed = sum(ok for _, ok in results)
    print(f"\n{passed}/{len(results)} passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
