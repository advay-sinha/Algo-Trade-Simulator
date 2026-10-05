"""Which code produced a result: the commit, for run manifests (Phase 13c)."""

from __future__ import annotations

import os
import subprocess
from functools import lru_cache
from pathlib import Path
from typing import Dict

from backend.config import HOSTED

REPO_ROOT = Path(__file__).resolve().parents[2]


@lru_cache(maxsize=1)
def code_version() -> Dict[str, object]:
    """Vercel's build SHA when deployed, GIT_COMMIT if set, else `git` in a local checkout."""
    for key in ("VERCEL_GIT_COMMIT_SHA", "GIT_COMMIT"):
        value = os.getenv(key, "").strip()
        if value:
            return {"commit": value, "dirty": False, "source": key}
    if not HOSTED:
        try:
            commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, capture_output=True, text=True, timeout=3, check=True).stdout.strip()
            status = subprocess.run(["git", "status", "--porcelain", "--untracked-files=no"], cwd=REPO_ROOT, capture_output=True, text=True, timeout=3, check=True).stdout
            return {"commit": commit, "dirty": bool(status.strip()), "source": "git"}
        except (OSError, subprocess.SubprocessError):
            pass
    return {"commit": "unknown", "dirty": False, "source": "unavailable"}
