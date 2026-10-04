"""Local stand-in for the Hugging Face inference API, for offline development and interface checks.

Returns FinBERT-shaped label scores and sentence-embedding-shaped vectors (keyword based — not a
real model). Start it, then run the backend with:
  HF_TOKEN=local HF_INFERENCE_URL=http://127.0.0.1:8765 uvicorn backend.main:app --port 8000

Usage: python scripts/fake_hf_inference.py [--port 8765]
"""
import json
import math
import re
from http.server import BaseHTTPRequestHandler, HTTPServer

CONCEPTS = {
    "earnings": 0, "profit": 0, "revenue": 0, "guidance": 0, "quarter": 0, "results": 0, "beats": 0,
    "volatility": 1, "drawdown": 1, "drawdowns": 1, "risk": 1, "losses": 1, "crash": 1, "turbulence": 1,
    "rates": 2, "fed": 2, "inflation": 2, "yields": 2,
    "crossover": 3, "moving": 3, "average": 3, "sma": 3, "trend": 3, "backtest": 3,
}


def embed(text):
    v = [0.0] * 6
    for w in re.findall(r"[a-z]+", text.lower()):
        v[CONCEPTS.get(w, 4 + (len(w) % 2))] += 1.0 if w in CONCEPTS else 0.08
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def classify(text):
    t = text.lower()
    if any(w in t for w in ("beats", "raises", "record", "surge")):
        return [{"label": "positive", "score": 0.94}, {"label": "neutral", "score": 0.04}, {"label": "negative", "score": 0.02}]
    if any(w in t for w in ("misses", "cuts", "plunge", "lawsuit", "drawdown")):
        return [{"label": "negative", "score": 0.89}, {"label": "neutral", "score": 0.07}, {"label": "positive", "score": 0.04}]
    return [{"label": "neutral", "score": 0.81}, {"label": "positive", "score": 0.12}, {"label": "negative", "score": 0.07}]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        inputs = body.get("inputs")
        texts = inputs if isinstance(inputs, list) else [inputs]
        out = [embed(t) for t in texts] if self.path.endswith("/pipeline/feature-extraction") else [classify(t) for t in texts]
        data = json.dumps(out).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    port = parser.parse_args().port
    print(f"Fake HF inference on http://127.0.0.1:{port}")
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
