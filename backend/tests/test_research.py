"""Research NLP: sentiment mapping, notes, retrieval (user-scoped), cold starts, copilot citations.
Inference is stubbed — no network, no HF token."""

import asyncio
import math
import re
import uuid

from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage

from backend.config import settings
from backend.llm import rag
from backend.main import app
from backend.services import hf_inference, rate_limiter, sentiment_service
from backend.tests.test_api import _stub_market
from backend.tests.test_copilot import ScriptedLLM, new_store, run

# Tiny "semantic" space: words map to shared concepts, so related phrasing lands close together
# without sharing keywords (enough to test ranking logic, not model quality).
CONCEPTS = {
    "earnings": 0, "profit": 0, "revenue": 0, "guidance": 0, "quarter": 0, "results": 0,
    "volatility": 1, "drawdown": 1, "risk": 1, "losses": 1, "crash": 1, "turbulence": 1,
    "rates": 2, "fed": 2, "inflation": 2, "yields": 2,
    "crossover": 3, "moving": 3, "average": 3, "sma": 3, "trend": 3,
}


def fake_embed(texts):
    vectors = []
    for text in texts:
        vector = [0.0] * 5
        for word in re.findall(r"[a-z]+", text.lower()):
            vector[CONCEPTS.get(word, 4)] += 1.0 if word in CONCEPTS else 0.05
        norm = math.sqrt(sum(v * v for v in vector)) or 1.0
        vectors.append([v / norm for v in vector])
    return vectors


def fake_classify(texts):
    rows = []
    for text in texts:
        lower = text.lower()
        if "beats" in lower or "raises" in lower:
            rows.append([{"label": "positive", "score": 0.93}, {"label": "neutral", "score": 0.05}, {"label": "negative", "score": 0.02}])
        elif "misses" in lower or "cuts" in lower:
            rows.append([{"label": "negative", "score": 0.88}, {"label": "neutral", "score": 0.08}, {"label": "positive", "score": 0.04}])
        else:
            rows.append([{"label": "neutral", "score": 0.7}, {"label": "positive", "score": 0.2}, {"label": "negative", "score": 0.1}])
    return rows


class nlp_stubbed:
    """Context manager: pretend HF is configured and route inference to the fakes."""

    def __init__(self, configured=True):
        self.configured = configured

    def __enter__(self):
        self.saved = (settings.hf_token, hf_inference.embed, hf_inference.classify)
        settings.hf_token = "test-token" if self.configured else None
        hf_inference.embed, hf_inference.classify = fake_embed, fake_classify
        return self

    def __exit__(self, *exc):
        settings.hf_token, hf_inference.embed, hf_inference.classify = self.saved


def _client():
    rate_limiter.reset()
    return TestClient(app)


def _signup(client):
    email = f"nlp-{uuid.uuid4().hex[:10]}@example.com"
    response = client.post("/api/auth/signup", json={"email": email, "password": "Tr1cky-Horse-42", "name": "Nlp"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_label_mapping_and_missing_labels():
    result = sentiment_service.summarize([{"label": "Positive", "score": 0.8}, {"label": "negative", "score": 0.15}, {"label": "neutral", "score": 0.05}])
    assert result["label"] == "bullish" and result["confidence"] == 0.8
    assert result["scores"] == {"bullish": 0.8, "bearish": 0.15, "neutral": 0.05}
    partial = sentiment_service.summarize([{"label": "negative", "score": 0.6}])
    assert partial["label"] == "bearish" and partial["scores"]["bullish"] is None
    unknown = sentiment_service.summarize([{"label": "LABEL_7", "score": 0.9}])
    assert unknown["label"] == "neutral" and unknown["confidence"] is None


def test_classification_shapes_are_normalized():
    single = hf_inference._normalize_classification([{"label": "positive", "score": 0.9}, {"label": "negative", "score": 0.1}], 1)
    assert len(single) == 1 and len(single[0]) == 2
    nested = hf_inference._normalize_classification([[{"label": "positive", "score": 0.9}], [{"label": "negative", "score": 0.7}]], 2)
    assert [row[0]["label"] for row in nested] == ["positive", "negative"]
    token_vectors = [[[1.0, 0.0], [0.0, 1.0]]]
    assert hf_inference._pool(token_vectors[0]) == [0.5, 0.5]


def test_sentiment_endpoint_needs_configuration_then_classifies():
    client = _client()
    headers = _signup(client)
    with nlp_stubbed(configured=False):
        response = client.post("/api/research/sentiment", json={"texts": ["Company beats earnings, raises guidance"]}, headers=headers)
        assert response.status_code == 503 and "HF_TOKEN" in response.json()["detail"]
    with nlp_stubbed():
        response = client.post("/api/research/sentiment", json={"texts": ["Company beats earnings, raises guidance", "Retailer misses estimates and cuts outlook"]}, headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["model"] == settings.sentiment_model
    assert [r["label"] for r in body["results"]] == ["bullish", "bearish"]
    assert body["results"][0]["confidence"] > 0.5
    assert client.post("/api/research/sentiment", json={"texts": []}, headers=headers).status_code == 422
    assert client.post("/api/research/sentiment", json={"texts": ["x"]}).status_code == 401


def test_notes_crud_validation_and_semantic_query():
    client = _client()
    headers = _signup(client)
    with nlp_stubbed():
        a = client.post("/api/research/notes", json={"title": "Q3 earnings view", "body": "Strong quarter results; revenue and profit guidance raised."}, headers=headers)
        b = client.post("/api/research/notes", json={"title": "Risk memo", "body": "Drawdown and volatility spiked during the crash."}, headers=headers)
        assert a.status_code == 201 and b.status_code == 201
        assert a.json()["indexed"] is True and "embedding" not in a.json()
        assert a.json()["sentiment"]["label"] in ("bullish", "neutral", "bearish")
        # Related phrasing, no shared keywords with the risk memo's title/body.
        found = client.post("/api/research/rag/query", json={"query": "How bad were the losses and turbulence?", "k": 2}, headers=headers).json()
    assert found["searched"] == 2 and found["method"] == "numpy"
    assert found["hits"][0]["id"] == b.json()["id"] and found["hits"][0]["score"] > found["hits"][1]["score"]
    assert -1.0 <= found["hits"][1]["score"] <= 1.0

    listed = client.get("/api/research/notes", headers=headers).json()
    assert [n["id"] for n in listed] == [b.json()["id"], a.json()["id"]]  # newest first
    assert client.post("/api/research/notes", json={"title": "No body"}, headers=headers).status_code == 422
    assert client.post("/api/research/notes", json={"kind": "backtest"}, headers=headers).status_code == 422
    assert client.delete(f"/api/research/notes/{a.json()['id']}", headers=headers).status_code == 204
    assert client.delete(f"/api/research/notes/{a.json()['id']}", headers=headers).status_code == 404


def test_retrieval_never_crosses_users():
    client = _client()
    alice, bob = _signup(client), _signup(client)
    with nlp_stubbed():
        note = client.post("/api/research/notes", json={"title": "Alice's secret thesis", "body": "Fed rates and inflation will drive yields."}, headers=alice).json()
        bob_query = client.post("/api/research/rag/query", json={"query": "inflation and yields", "k": 5}, headers=bob).json()
        alice_query = client.post("/api/research/rag/query", json={"query": "inflation and yields", "k": 5}, headers=alice).json()
    assert bob_query["hits"] == [] and bob_query["searched"] == 0
    assert alice_query["hits"][0]["id"] == note["id"]
    assert client.get("/api/research/notes", headers=bob).json() == []
    assert client.delete(f"/api/research/notes/{note['id']}", headers=bob).status_code == 404


def test_unindexed_notes_are_indexed_on_a_later_query():
    client = _client()
    headers = _signup(client)
    with nlp_stubbed(configured=False):
        saved = client.post("/api/research/notes", json={"title": "Trend idea", "body": "Moving average crossover on trend days."}, headers=headers)
        assert saved.status_code == 201 and saved.json()["indexed"] is False
        assert client.post("/api/research/rag/query", json={"query": "sma"}, headers=headers).status_code == 503
    with nlp_stubbed():
        found = client.post("/api/research/rag/query", json={"query": "sma crossover"}, headers=headers).json()
    assert found["reindexed"] == 1 and found["hits"][0]["id"] == saved.json()["id"]
    assert client.get("/api/research/notes", headers=headers).json()[0]["indexed"] is True


def test_backtest_note_is_summarized_and_idempotent():
    restore = _stub_market()
    try:
        client = _client()
        headers = _signup(client)
        run_response = client.post("/api/backtest/run", json={"symbol": "AAPL", "strategy": "sma-crossover", "params": {"shortWindow": 10, "longWindow": 30}}, headers=headers)
        assert run_response.status_code == 200, run_response.text
        backtest_id = run_response.json()["id"]
        with nlp_stubbed():
            first = client.post("/api/research/notes", json={"kind": "backtest", "refId": backtest_id, "body": "Lagged buy-and-hold."}, headers=headers)
            again = client.post("/api/research/notes", json={"kind": "backtest", "refId": backtest_id}, headers=headers)
        assert first.status_code == 201 and again.status_code == 200 and again.json()["id"] == first.json()["id"]
        assert first.json()["sentiment"] is None and first.json()["indexed"] is True  # no tone score on generated summaries
        note = first.json()
        assert note["title"].startswith("Backtest AAPL") and "buy-and-hold" in note["body"] and note["body"].endswith("Lagged buy-and-hold.")
        other = _signup(client)
        assert client.post("/api/research/notes", json={"kind": "backtest", "refId": backtest_id}, headers=other).status_code == 404
    finally:
        restore()


class FakeResponse:
    def __init__(self, status, body=None, headers=None):
        self.status_code, self._body, self.headers = status, body or {}, headers or {}

    def json(self):
        return self._body


def test_cold_start_retries_then_reports_warming_up_and_masks_errors():
    import requests

    saved = (requests.post, hf_inference.time.sleep, settings.hf_token, hf_inference.WARMUP_BUDGET_SECONDS)
    calls = []
    try:
        settings.hf_token = "t"
        hf_inference.time.sleep = lambda seconds: calls.append(("sleep", seconds))
        queue = [FakeResponse(503, {"estimated_time": 2}), FakeResponse(200, [[{"label": "positive", "score": 0.9}]])]
        requests.post = lambda *a, **k: queue.pop(0)
        assert hf_inference._post("m", {"inputs": ["x"]}) == [[{"label": "positive", "score": 0.9}]]
        assert ("sleep", 2.0) in calls

        hf_inference.WARMUP_BUDGET_SECONDS = 0.5
        requests.post = lambda *a, **k: FakeResponse(503, {"estimated_time": 20})
        try:
            hf_inference._post("m", {})
            raise AssertionError("expected NlpWarmingUp")
        except hf_inference.NlpWarmingUp as exc:
            assert exc.status_code == 503 and exc.retry_after == 20

        requests.post = lambda *a, **k: FakeResponse(401, {"error": "Invalid username or password. secret-detail"})
        try:
            hf_inference._post("m", {})
            raise AssertionError("expected NlpUnavailable")
        except hf_inference.NlpUnavailable as exc:
            assert "secret-detail" not in exc.message and "HF_TOKEN" in exc.message
    finally:
        requests.post, hf_inference.time.sleep, settings.hf_token, hf_inference.WARMUP_BUDGET_SECONDS = saved


def test_copilot_cites_retrieved_notes():
    store = new_store()
    with nlp_stubbed():
        asyncio.run(rag.create_note(store, "carol", "note", "Earnings season playbook", "Buy quality names after strong quarter results and raised guidance."))
        asyncio.run(rag.create_note(store, "dave", "note", "Dave's private note", "Earnings revenue profit guidance quarter."))
        llm = ScriptedLLM([AIMessage(content="Per your notes [Note: Earnings season playbook], focus on results.")])
        events = run("carol", store, "What did I conclude about earnings and guidance?", llm)
    assert events[0]["type"] == "sources"
    titles = [s["title"] for s in events[0]["sources"]]
    assert titles == ["Earnings season playbook"]  # dave's note never appears
    context = llm.calls[0][1].content
    assert "Earnings season playbook" in context and "Dave" not in context and "[Note: <title>]" in context
    assert events[-1]["type"] == "done"


def test_copilot_without_nlp_has_no_sources():
    store = new_store()
    llm = ScriptedLLM([AIMessage(content="Hello.")])
    events = run("erin", store, "hi", llm)
    assert [e["type"] for e in events] == ["message", "done"]


def test_note_tools_save_and_search():
    store = new_store()
    with nlp_stubbed():
        from backend.tests.test_copilot import tool_call

        llm = ScriptedLLM([
            tool_call("save_research_note", {"title": "Rates thesis", "body": "Fed hikes push yields and inflation expectations."}, "s1"),
            tool_call("search_research_notes", {"query": "inflation outlook"}, "s2"),
            AIMessage(content="Saved and found it."),
        ])
        events = run("frank", store, "Save a note on rates then find it", llm)
    ends = [e for e in events if e["type"] == "tool_end"]
    assert all(e["ok"] for e in ends)
    assert ends[1]["result"]["hits"][0]["title"] == "Rates thesis"
    actions = next(e for e in events if e["type"] == "actions")["actions"]
    assert actions[0]["type"] == "note" and actions[0]["path"] == "/research"
