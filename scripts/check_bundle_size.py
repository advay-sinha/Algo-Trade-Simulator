"""Measure the installed size of the deployed Python dependencies.

Installs the deployed requirements.txt into a temporary directory, removes what deployments exclude
(tests, __pycache__, .pyi stubs, dist-info), and reports the total plus the largest packages.
Exit code 1 if the trimmed size exceeds --fail-mb (default 500); a warning above --warn-mb.

Usage: python scripts/check_bundle_size.py [--requirements requirements.txt]
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PRUNE_DIRS = {"tests", "test", "__pycache__"}
PRUNE_SUFFIXES = {".pyi", ".pyc"}


def folder_size(path: Path) -> int:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def prune(root: Path) -> None:
    for path in sorted(root.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if path.is_dir() and (path.name in PRUNE_DIRS or path.name.endswith(".dist-info")):
            shutil.rmtree(path, ignore_errors=True)
        elif path.is_file() and path.suffix in PRUNE_SUFFIXES:
            path.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--requirements", default="requirements.txt")
    parser.add_argument("--warn-mb", type=float, default=250)
    parser.add_argument("--fail-mb", type=float, default=500)
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        target = Path(tmp) / "site"
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "--no-compile", "--target", str(target), "-r", args.requirements],
            check=True,
        )
        raw = folder_size(target)
        prune(target)
        trimmed = folder_size(target)
        sizes = sorted(((folder_size(p), p.name) for p in target.iterdir() if p.is_dir()), reverse=True)

    mb = lambda value: value / 1024 / 1024  # noqa: E731
    print(f"Installed: {mb(raw):.1f} MB  |  after pruning tests/stubs/metadata: {mb(trimmed):.1f} MB")
    print("Largest packages:")
    for size, name in sizes[:12]:
        print(f"  {mb(size):8.1f} MB  {name}")
    if mb(trimmed) > args.fail_mb:
        print(f"FAIL: above {args.fail_mb:.0f} MB")
        return 1
    if mb(trimmed) > args.warn_mb:
        print(f"WARNING: above {args.warn_mb:.0f} MB — check the hosting platform's function size limit before deploying there")
    return 0


if __name__ == "__main__":
    sys.exit(main())
