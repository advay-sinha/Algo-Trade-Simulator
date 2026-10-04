"""Test configuration: in-memory store, repo root importable, no external services."""

import os
import sys
from pathlib import Path

# Forced (not setdefault): a developer shell may export different values.
os.environ["USE_IN_MEMORY_DB"] = "true"
os.environ["ENABLE_DEV_ENDPOINTS"] = "false"
os.environ["STRICT_DB"] = "false"
# Never log test training runs to a real tracking server or call a real LLM provider.
for _key in ("MLFLOW_TRACKING_URI", "GROQ_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY", "LLM_PROVIDER", "LLM_API_KEY"):
    os.environ[_key] = ""

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
