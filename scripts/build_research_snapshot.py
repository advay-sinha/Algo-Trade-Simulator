"""Build a versioned research snapshot (daily prices, volume, dividends) for a universe.

Run from the repository root:

    .venv/Scripts/python scripts/build_research_snapshot.py --universe nifty100-current
    .venv/Scripts/python scripts/build_research_snapshot.py --universe nifty100-current --save

Without --save it downloads, builds and prints the coverage report and version only. With --save
it stores the snapshot in MongoDB (GridFS bucket `research_snapshots` + `research_datasets`) using
the configured connection string; it refuses to fall back to an in-memory store. Snapshots are
content-addressed: the same data always gets the same version, so re-saving is a no-op.

Market data comes from Yahoo Finance through yfinance (split-adjusted prices, dividends and split
events; auto_adjust=False). Never commit snapshot files to the repository.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import pandas as pd  # noqa: E402

from backend.research import snapshots  # noqa: E402
from backend.research.universe import SECTOR_CAVEAT, SURVIVORSHIP_CAVEAT, UNIVERSES, custom_symbols, universe_symbols  # noqa: E402

PERIODS = ("1y", "2y", "5y", "10y", "max")
RETRIES = 3


def _download(symbols: List[str], period: str) -> Dict[str, pd.DataFrame]:
    import yfinance as yf

    yf.set_tz_cache_location(tempfile.gettempdir())
    frames: Dict[str, pd.DataFrame] = {}
    data = yf.download(symbols, period=period, auto_adjust=False, actions=True, group_by="ticker", threads=True, progress=False)
    for symbol in symbols:
        try:
            frame = data[symbol].dropna(subset=["Close"])
        except KeyError:
            frame = pd.DataFrame()
        frames[symbol] = frame
    for attempt in range(1, RETRIES + 1):
        missing = [symbol for symbol, frame in frames.items() if frame.empty]
        if not missing:
            break
        time.sleep(2 * attempt)
        for symbol in missing:
            try:
                frames[symbol] = yf.Ticker(symbol).history(period=period, auto_adjust=False, actions=True).dropna(subset=["Close"])
            except Exception as exc:  # noqa: BLE001 - reported below
                print(f"  {symbol}: {type(exc).__name__}")
    return frames


def _benchmark(symbol: str, period: str) -> pd.DataFrame:
    import yfinance as yf

    return yf.Ticker(symbol).history(period=period, auto_adjust=False, actions=True)


async def _save(snapshot: snapshots.Snapshot) -> None:
    from backend.config import mask_mongo_dsn, resolve_mongo_dsn, settings
    from backend.stores import MongoStore

    dsn = resolve_mongo_dsn(settings)
    if not dsn:
        raise SystemExit("No MongoDB connection string configured (MONGO_URL / MONGODB_URI / MONGO_URI); nothing saved.")
    store = MongoStore(dsn, settings.mongodb_db)
    try:
        await store.init()
        stored = await snapshots.save_snapshot(store, snapshot)
        print(f"Saved to {mask_mongo_dsn(dsn)} as {stored['version']} ({stored.get('sizeBytes', 0) / 1e6:.1f} MB)")
    finally:
        await store.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--universe", choices=sorted(UNIVERSES))
    group.add_argument("--symbols", help="Comma-separated NSE symbols (custom universe, at most 100)")
    parser.add_argument("--period", default="10y", choices=PERIODS)
    parser.add_argument("--benchmark", default="^NSEI")
    parser.add_argument("--max-benchmark-missing", type=float, default=0.05, help="Refuse to save above this fraction of sessions without a benchmark bar")
    parser.add_argument("--save", action="store_true", help="Store the snapshot in MongoDB")
    args = parser.parse_args()

    if args.universe:
        universe_id, symbols = args.universe, universe_symbols(args.universe)
        caveats = [SURVIVORSHIP_CAVEAT, SECTOR_CAVEAT]
    else:
        universe_id, symbols = "custom", custom_symbols(args.symbols.split(","))
        caveats = ["A list chosen today knows which companies survived; treat results as survivorship-biased.", SECTOR_CAVEAT]
    print(f"Downloading {len(symbols)} symbols + {args.benchmark}, period {args.period} ...")
    started = time.perf_counter()
    frames = _download(symbols, args.period)
    benchmark = _benchmark(args.benchmark, args.period)
    downloaded_at = datetime.now(timezone.utc).isoformat()
    print(f"  downloaded in {time.perf_counter() - started:.1f}s")

    snapshot = snapshots.build_snapshot(
        frames,
        benchmark,
        universe=universe_id,
        benchmark_symbol=args.benchmark,
        source="Yahoo Finance via yfinance (auto_adjust=False, actions=True)",
        downloaded_at=downloaded_at,
        survivorship_biased=True,
        caveats=caveats,
    )
    meta = snapshot.meta
    print(f"Version   {snapshot.version}")
    print(f"Period    {meta['period']['start']} .. {meta['period']['end']} ({meta['period']['sessions']} sessions)")
    print(f"Symbols   {meta['symbolCount']} with data; no data: {', '.join(s for s in symbols if s not in snapshot.symbols) or 'none'}")
    print(f"Excluded  weekend {len(meta['excludedDates']['weekend'])}, no-trading {len(meta['excludedDates']['noTrading'])}: {', '.join(meta['excludedDates']['noTrading'][:12])}")
    print(f"Benchmark {meta['benchmarkCoverage']['sessions']} sessions, {meta['benchmarkCoverage']['missing']} missing")
    print(f"Coverage  {meta['coverageSummary']}")
    late = [item for item in meta["coverage"] if item["firstDate"] and item["firstDate"] > meta["period"]["start"]]
    for item in late:
        print(f"  late listing {item['symbol']:<16} from {item['firstDate']} ({item['bars']} bars)")
    blob = snapshots.serialize(snapshot)
    print(f"Serialized {len(blob) / 1e6:.1f} MB (compressed)")
    assert snapshots.deserialize(blob).version == snapshot.version

    missing_share = meta["benchmarkCoverage"]["missing"] / max(meta["period"]["sessions"], 1)
    if args.save:
        if missing_share > args.max_benchmark_missing:
            print(f"Refusing to save: benchmark missing on {missing_share:.1%} of sessions")
            return 2
        asyncio.run(_save(snapshot))
    else:
        print("Dry run: nothing saved (add --save to store it in MongoDB).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
