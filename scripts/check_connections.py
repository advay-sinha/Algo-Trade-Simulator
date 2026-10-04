"""Check the Hugging Face token and the MongoDB connection with the same settings the backend uses.

Reads the process environment first, then backend/.env (empty values in the environment fall back
to the file, so it also works under the test suite). Secrets are never printed: tokens show only
their length, and Mongo connection strings show only the host.

Usage (from the repository root):
  python scripts/check_connections.py              # both checks
  python scripts/check_connections.py --hf         # Hugging Face only
  python scripts/check_connections.py --mongo      # MongoDB only
  python scripts/check_connections.py --no-inference   # token check only, skip model calls
Exit code: 0 when every selected check passes, 1 otherwise.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import requests

REPO_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = REPO_ROOT / "backend" / ".env"
DEFAULT_SENTIMENT_MODEL = "ProsusAI/finbert"
DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
DEFAULT_INFERENCE_URL = "https://router.huggingface.co/hf-inference/models"
TIMEOUT = 20
WARMUP_SECONDS = 30


@dataclass
class CheckResult:
    name: str
    ok: bool
    lines: List[str] = field(default_factory=list)
    hint: Optional[str] = None


def _env_file_values() -> Dict[str, Optional[str]]:
    if not ENV_FILE.exists():
        return {}
    try:
        from dotenv import dotenv_values
    except ModuleNotFoundError:
        return {}
    return dict(dotenv_values(ENV_FILE))


_FILE_VALUES = _env_file_values()


def setting(*names: str, default: Optional[str] = None) -> Optional[str]:
    """First non-empty value among `names`, from the environment, then backend/.env."""
    for name in names:
        value = (os.environ.get(name) or "").strip() or (_FILE_VALUES.get(name) or "").strip()
        if value:
            return value
    return default


def mask_dsn(dsn: str) -> str:
    """Host part only: mongodb+srv://***@cluster0.abc.mongodb.net/..."""
    return re.sub(r"//[^@/]*@", "//***@", dsn).split("?")[0]


# --- Hugging Face -----------------------------------------------------------------------------

def _post_inference(url: str, token: str, payload: dict) -> requests.Response:
    deadline = time.monotonic() + WARMUP_SECONDS
    while True:
        response = requests.post(url, headers={"Authorization": f"Bearer {token}"}, json=payload, timeout=TIMEOUT)
        if response.status_code != 503 or time.monotonic() > deadline:
            return response
        time.sleep(3)  # model loading (cold start)


def check_hf(run_inference: bool = True) -> CheckResult:
    result = CheckResult("Hugging Face", ok=False)
    token = setting("HF_TOKEN", "HUGGINGFACEHUB_API_TOKEN")
    if not token:
        result.hint = "Set HF_TOKEN in backend/.env (huggingface.co → Settings → Access Tokens → a read token)."
        result.lines.append("HF_TOKEN: missing")
        return result
    shape = "looks like an hf_ token" if token.startswith("hf_") else "does NOT start with hf_"
    result.lines.append(f"HF_TOKEN: present ({len(token)} chars, {shape})")

    try:
        response = requests.get("https://huggingface.co/api/whoami-v2", headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT)
    except requests.RequestException as exc:
        result.lines.append(f"whoami: network error ({type(exc).__name__})")
        result.hint = "Check your internet connection / proxy."
        return result
    if response.status_code == 401:
        result.lines.append("whoami: 401 — token rejected")
        result.hint = "The token is revoked, mistyped, or belongs to a deleted account. Create a new read token and replace HF_TOKEN."
        return result
    if not response.ok:
        result.lines.append(f"whoami: HTTP {response.status_code}")
        result.hint = "Hugging Face may be having issues; try again shortly."
        return result
    info = response.json()
    role = ((info.get("auth") or {}).get("accessToken") or {}).get("role", "unknown")
    result.lines.append(f"whoami: OK — account {info.get('name', '?')}, token role {role}")

    if not run_inference:
        result.ok = True
        return result

    base = setting("HF_INFERENCE_URL", default=DEFAULT_INFERENCE_URL).rstrip("/")
    sentiment_model = setting("SENTIMENT_MODEL", default=DEFAULT_SENTIMENT_MODEL)
    embedding_model = setting("EMBEDDING_MODEL", default=DEFAULT_EMBEDDING_MODEL)
    ok = True
    try:
        response = _post_inference(f"{base}/{sentiment_model}", token, {"inputs": ["Company beats earnings, raises guidance"], "parameters": {"top_k": 5}})
        if response.ok:
            rows = response.json()
            row = rows[0] if rows and isinstance(rows[0], list) else rows
            best = max(row, key=lambda item: item["score"])
            result.lines.append(f"sentiment ({sentiment_model}): OK — '{best['label']}' {best['score']:.2f} for a bullish headline")
        else:
            ok = False
            result.lines.append(f"sentiment ({sentiment_model}): HTTP {response.status_code}")
            result.hint = _inference_hint(response.status_code, "SENTIMENT_MODEL")
        response = _post_inference(f"{base}/{embedding_model}/pipeline/feature-extraction", token, {"inputs": ["moving average crossover"]})
        if response.ok:
            vector = response.json()[0]
            while vector and isinstance(vector[0], list):  # token-level output → just report the width
                vector = vector[0]
            result.lines.append(f"embeddings ({embedding_model}): OK — {len(vector)} dimensions")
        else:
            ok = False
            result.lines.append(f"embeddings ({embedding_model}): HTTP {response.status_code}")
            result.hint = result.hint or _inference_hint(response.status_code, "EMBEDDING_MODEL")
    except (requests.RequestException, ValueError, KeyError, IndexError, TypeError) as exc:
        ok = False
        result.lines.append(f"inference: unexpected response ({type(exc).__name__})")
        result.hint = "The inference service answered in an unexpected shape; check HF_INFERENCE_URL."
    result.ok = ok
    return result


def _inference_hint(status: int, env_name: str) -> str:
    if status == 404:
        return f"The model isn't served by the inference provider; choose another and set {env_name}."
    if status in (401, 403):
        return "The token works for the Hub but not for inference — use a read token with inference access (fine-grained: 'Make calls to Inference Providers')."
    if status == 429:
        return "Rate limited (free monthly credits used up?). Try again later."
    if status == 503:
        return "The model is still loading after 30 s; try again in a minute."
    return "Unexpected inference error; try again shortly."


# --- MongoDB -----------------------------------------------------------------------------------

def check_mongo() -> CheckResult:
    result = CheckResult("MongoDB", ok=False)
    dsn = setting("MONGO_URL", "MONGODB_URI", "MONGO_URI")
    if not dsn:
        dsn = "mongodb://localhost:27017"
        result.lines.append("MONGO_URL / MONGODB_URI / MONGO_URI: not set — trying the local default")
    database = setting("MONGODB_DB", default="algo-trade-simulator")
    result.lines.append(f"target: {mask_dsn(dsn)} (database: {database})")
    try:
        from pymongo import MongoClient
        from pymongo.errors import ConfigurationError, OperationFailure, ServerSelectionTimeoutError
    except ModuleNotFoundError:
        result.hint = "pymongo isn't installed in this Python — run with .venv/Scripts/python."
        return result

    client = None
    try:
        client = MongoClient(dsn, serverSelectionTimeoutMS=8000, connectTimeoutMS=8000)
        client.admin.command("ping")
        version = client.server_info().get("version", "?")
        result.lines.append(f"ping: OK — server {version}")
        collections = client[database].list_collection_names()
        result.lines.append(f"read access: OK — {len(collections)} collections in '{database}'")
        result.ok = True
    except OperationFailure as exc:
        code = getattr(exc, "code", None)
        result.lines.append(f"auth/permission error (code {code})")
        if code in (18, 8000):
            result.hint = "Bad username or password. In Atlas → Database Access, reset the user's password, then update the connection string (URL-encode special characters like @ : / ? # in the password)."
        elif code == 13:
            result.hint = "Connected, but the user can't read this database — give it readWrite on the database in Atlas → Database Access."
        else:
            result.hint = "MongoDB refused the operation; check the user's roles."
    except ServerSelectionTimeoutError:
        result.lines.append("could not reach the server within 8 s")
        result.hint = "Atlas: add your current IP in Network Access (or 0.0.0.0/0 for testing). Local: start mongod. Also check VPN/firewall."
    except ConfigurationError as exc:
        result.lines.append(f"invalid connection string ({type(exc).__name__})")
        result.hint = "Check the format: mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority — SRV strings need DNS access."
    except Exception as exc:  # noqa: BLE001 - report the class only (messages can contain the DSN)
        result.lines.append(f"unexpected error ({type(exc).__name__})")
        result.hint = "See the error type above; the connection string may be malformed."
    finally:
        if client is not None:
            client.close()
    return result


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--hf", action="store_true", help="check Hugging Face only")
    parser.add_argument("--mongo", action="store_true", help="check MongoDB only")
    parser.add_argument("--no-inference", action="store_true", help="skip the sentiment/embedding model calls")
    args = parser.parse_args(argv)
    run_hf = args.hf or not args.mongo
    run_mongo = args.mongo or not args.hf

    print(f"Settings: environment, then {ENV_FILE.relative_to(REPO_ROOT)} ({'found' if ENV_FILE.exists() else 'not found'})\n")
    results = []
    if run_hf:
        results.append(check_hf(run_inference=not args.no_inference))
    if run_mongo:
        results.append(check_mongo())
    for item in results:
        print(f"[{'PASS' if item.ok else 'FAIL'}] {item.name}")
        for line in item.lines:
            print(f"    {line}")
        if not item.ok and item.hint:
            print(f"    → {item.hint}")
        print()
    return 0 if all(item.ok for item in results) else 1


if __name__ == "__main__":
    sys.exit(main())
