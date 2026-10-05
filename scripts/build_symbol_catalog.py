"""Build shared/symbols.json: the offline symbol catalog used for type-ahead search and ISIN lookup.

Development-time only (never runs in the build or on the server). Sources are public files:
  NSE equities      https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv
  NSE ETFs          https://nsearchives.nseindia.com/content/equities/eq_etfseclist.csv
  Nifty 50 / Next 50 / 500 constituents (tier + industry)
                    https://nsearchives.nseindia.com/content/indices/ind_nifty{50,next50,500}list.csv
  US listings       https://www.nasdaqtrader.com/dynamic/SymDir/{nasdaqlisted,otherlisted}.txt
plus the hand-curated scripts/symbol_aliases.json (indices, short names, US tier list).

Usage:
  python scripts/build_symbol_catalog.py                 # download everything
  python scripts/build_symbol_catalog.py --source-dir D  # read files saved in D (same file names)

NSE sometimes refuses scripted downloads; if so, save the files from a browser into a folder and
pass --source-dir. Output is deterministic (sorted rows, stable fields).
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path
from typing import Dict, Iterable, List, Optional

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "shared" / "symbols.json"
ALIASES = ROOT / "scripts" / "symbol_aliases.json"
SYMBOL_RE = re.compile(r"^[A-Za-z0-9.^=&\-]{1,20}$")  # mirrors backend/models/common.py
ISIN_RE = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}[0-9]$")
BUDGET_GZIP_BYTES = 150 * 1024
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36",
    "Referer": "https://www.nseindia.com/",
    "Accept": "text/csv,text/plain,*/*",
}
NSE = "https://nsearchives.nseindia.com/content"
SOURCES = {
    "EQUITY_L.csv": f"{NSE}/equities/EQUITY_L.csv",
    "eq_etfseclist.csv": f"{NSE}/equities/eq_etfseclist.csv",
    "ind_nifty50list.csv": f"{NSE}/indices/ind_nifty50list.csv",
    "ind_niftynext50list.csv": f"{NSE}/indices/ind_niftynext50list.csv",
    "ind_nifty500list.csv": f"{NSE}/indices/ind_nifty500list.csv",
    "nasdaqlisted.txt": "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
    "otherlisted.txt": "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt",
}
NSE_SERIES = {"EQ", "BE", "BZ"}
US_EXCHANGES = {"N": "NYSE", "A": "NYSE American", "P": "NYSE Arca", "Z": "Cboe", "V": "IEX"}
US_EXCLUDE = re.compile(
    r"\b(warrants?|rights?|units?|preferred|preference|notes? due|debentures?|subordinated|senior notes|perpetual|depositary shares? (each )?represent(ing|s)? [0-9/.]+(th)? (of a|interest))\b|%",
    re.IGNORECASE,
)
US_NAME_NOISE = re.compile(r"\b(common stock|ordinary shares?|common shares?|class [a-c] ordinary shares|shares of beneficial interest|new)\b", re.IGNORECASE)


def isin_valid(isin: str) -> bool:
    """ISO 6166 check digit (Luhn over letters expanded to numbers)."""
    if not ISIN_RE.match(isin):
        return False
    digits = "".join(str(int(ch, 36)) for ch in isin[:-1])
    total = 0
    for index, char in enumerate(reversed(digits)):
        value = int(char)
        if index % 2 == 0:
            value *= 2
            if value > 9:
                value -= 9
        total += value
    return (10 - total % 10) % 10 == int(isin[-1])


def fetch(name: str, source_dir: Optional[Path]) -> str:
    if source_dir is not None:
        return (source_dir / name).read_text(encoding="utf-8-sig", errors="replace")
    request = urllib.request.Request(SOURCES[name], headers=HEADERS)
    with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310 - fixed public URLs
        return response.read().decode("utf-8-sig", errors="replace")


def rows(text: str, delimiter: str = ",") -> Iterable[Dict[str, str]]:
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    for row in reader:
        yield {(key or "").strip(): (value or "").strip() for key, value in row.items()}


def clean_us_name(name: str) -> str:
    adr = bool(re.search(r"american depositary", name, re.IGNORECASE))
    name = re.sub(r"american depositary (shares?|receipts?).*$", "", name, flags=re.IGNORECASE)
    name = name.replace(" - ", " ")
    name = US_NAME_NOISE.sub("", name)
    name = re.sub(r"\s+", " ", name).strip(" ,-")
    return f"{name} (ADR)" if adr else name


def build(source_dir: Optional[Path]) -> Dict[str, object]:
    aliases = json.loads(ALIASES.read_text(encoding="utf-8"))
    catalog: Dict[str, Dict[str, object]] = {}
    counts: Dict[str, int] = {}

    def add(symbol: str, name: str, exchange: str, kind: str, isin: Optional[str] = None, tier: int = 0, sector: Optional[str] = None) -> None:
        if not SYMBOL_RE.match(symbol) or not name:
            return
        if isin and not isin_valid(isin):
            isin = None
        existing = catalog.get(symbol)
        if existing:
            existing["k"] = max(int(existing["k"]), tier)
            existing["i"] = existing["i"] or isin
            existing["c"] = existing["c"] or sector
            return
        catalog[symbol] = {"s": symbol, "n": name, "x": exchange, "t": kind, "i": isin, "k": tier, "c": sector, "a": []}

    # Tiers and industries from index constituent lists (Nifty 50 → 2, Next 50 → 1, Nifty 500 → industry only).
    tier: Dict[str, int] = {}
    industry: Dict[str, str] = {}
    for file_name, level in (("ind_nifty50list.csv", 2), ("ind_niftynext50list.csv", 1), ("ind_nifty500list.csv", 0)):
        for row in rows(fetch(file_name, source_dir)):
            symbol = row.get("Symbol", "")
            if not symbol:
                continue
            tier[symbol] = max(tier.get(symbol, 0), level)
            if row.get("Industry"):
                industry[symbol] = row["Industry"]

    for row in rows(fetch("EQUITY_L.csv", source_dir)):
        if row.get("SERIES") not in NSE_SERIES:
            continue
        symbol = row.get("SYMBOL", "")
        add(f"{symbol}.NS", row.get("NAME OF COMPANY", ""), "NSE", "EQ", row.get("ISIN NUMBER") or None, tier.get(symbol, 0), industry.get(symbol))
    counts["nse_equities"] = sum(1 for item in catalog.values() if item["x"] == "NSE")

    for row in rows(fetch("eq_etfseclist.csv", source_dir)):
        symbol = row.get("Symbol", "")
        underlying = row.get("Underlying Asset") or row.get("Underlying Key") or "Index"
        add(f"{symbol}.NS", f"{underlying} ETF", "NSE", "ETF", row.get("ISINNumber") or None, 0, None)
    counts["nse_etfs"] = sum(1 for item in catalog.values() if item["t"] == "ETF")

    us_tier = set(aliases.get("usTier", []))
    us_before = len(catalog)
    for row in rows(fetch("nasdaqlisted.txt", source_dir), "|"):
        symbol = row.get("Symbol", "")
        if not symbol or row.get("Test Issue") == "Y" or symbol.startswith("File Creation"):
            continue
        is_etf = row.get("ETF") == "Y"
        name = row.get("Security Name", "")
        if not is_etf and US_EXCLUDE.search(name):
            continue
        if is_etf and symbol not in us_tier:
            continue
        add(symbol.replace(".", "-"), clean_us_name(name), "NASDAQ", "ETF" if is_etf else "EQ", None, 2 if symbol in us_tier else 0)
    for row in rows(fetch("otherlisted.txt", source_dir), "|"):
        symbol = row.get("ACT Symbol", "")
        if not symbol or row.get("Test Issue") == "Y" or symbol.startswith("File Creation") or "$" in symbol:
            continue
        is_etf = row.get("ETF") == "Y"
        name = row.get("Security Name", "")
        if not is_etf and US_EXCLUDE.search(name):
            continue
        yahoo = symbol.replace(".", "-")
        if is_etf and yahoo not in us_tier:
            continue
        add(yahoo, clean_us_name(name), US_EXCHANGES.get(row.get("Exchange", ""), "US"), "ETF" if is_etf else "EQ", None, 2 if yahoo in us_tier else 0)
    counts["us_listings"] = len(catalog) - us_before

    for symbol, name, exchange, kind in aliases.get("indices", []):
        add(symbol, name, exchange, kind, None, 2)
    counts["indices_and_extras"] = len(aliases.get("indices", []))

    missing: List[str] = []
    for symbol, words in aliases.get("aliases", {}).items():
        if symbol not in catalog:
            missing.append(symbol)
            continue
        catalog[symbol]["a"] = sorted({word.lower() for word in words})
    if missing:
        print(f"warning: aliases for unknown symbols skipped: {', '.join(sorted(missing))}", file=sys.stderr)

    fields = ["s", "n", "x", "t", "i", "k", "c", "a"]
    ordered = [[item[field] for field in fields] for item in sorted(catalog.values(), key=lambda item: str(item["s"]))]
    counts["total"] = len(ordered)
    return {"version": 1, "generatedAt": date.today().isoformat(), "sources": counts, "fields": fields, "rows": ordered}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source-dir", type=Path, help="Read source files from this folder instead of downloading")
    args = parser.parse_args()
    catalog = build(args.source_dir)
    payload = json.dumps(catalog, ensure_ascii=False, separators=(",", ":"))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(payload + "\n", encoding="utf-8")
    compressed = len(gzip.compress(payload.encode("utf-8"), compresslevel=9))
    print(json.dumps(catalog["sources"]), f"raw={len(payload) // 1024} KB gzip={compressed // 1024} KB")
    if compressed > BUDGET_GZIP_BYTES:
        print(f"over budget: {compressed // 1024} KB gzip > {BUDGET_GZIP_BYTES // 1024} KB", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
