"""Live connection checks (network). Skipped unless LIVE_CHECKS=1, so the normal suite and CI
stay offline:

  LIVE_CHECKS=1 pytest backend/tests/test_live_connections.py -v

Uses scripts/check_connections.py, which reads backend/.env even though conftest blanks the
service variables for the rest of the suite.
"""

import importlib.util
import os
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(os.environ.get("LIVE_CHECKS", "").strip().lower() not in ("1", "true", "yes"), reason="live checks: set LIVE_CHECKS=1")

_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "check_connections.py"
_spec = importlib.util.spec_from_file_location("check_connections", _SCRIPT)
checks = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = checks  # dataclasses need the module registered
_spec.loader.exec_module(checks)


def _explain(result):
    return "\n".join([*result.lines, f"hint: {result.hint}" if result.hint else ""])


def test_hf_token_and_inference():
    result = checks.check_hf(run_inference=True)
    assert result.ok, _explain(result)


def test_mongodb_connection():
    result = checks.check_mongo()
    assert result.ok, _explain(result)
