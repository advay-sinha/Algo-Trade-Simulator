"""Test configuration: in-memory store, repo root importable, no external services."""

import os
import sys
from pathlib import Path

os.environ.setdefault("USE_IN_MEMORY_DB", "true")
os.environ.setdefault("ENABLE_DEV_ENDPOINTS", "false")

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
