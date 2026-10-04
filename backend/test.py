"""MongoDB connectivity check (kept for compatibility). Prefer scripts/check_connections.py,
which also checks the Hugging Face token. Never prints credentials."""

import importlib.util
import sys
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "check_connections.py"
_spec = importlib.util.spec_from_file_location("check_connections", _SCRIPT)
_checks = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = _checks  # dataclasses need the module registered
_spec.loader.exec_module(_checks)

if __name__ == "__main__":
    sys.exit(_checks.main(["--mongo"]))
