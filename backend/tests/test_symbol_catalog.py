"""The committed offline symbol catalog (shared/symbols.json) and its backend accessors."""

import gzip
import json
import re

from backend.models.common import SYMBOL_PATTERN
from backend.services import symbol_catalog
from backend.services.market_data_service import build_offline_search

ANCHORS = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "M&M.NS", "AAPL", "MSFT", "GOOGL", "^NSEI", "NIFTYBEES.NS"]


def _isin_valid(isin: str) -> bool:
    digits = "".join(str(int(ch, 36)) for ch in isin[:-1])
    total = 0
    for index, char in enumerate(reversed(digits)):
        value = int(char) * (2 if index % 2 == 0 else 1)
        total += value - 9 if value > 9 else value
    return (10 - total % 10) % 10 == int(isin[-1])


def test_catalog_schema_symbols_and_isins():
    raw = symbol_catalog.CATALOG_PATH.read_text(encoding="utf-8")
    catalog = json.loads(raw)
    assert catalog["version"] == 1 and catalog["fields"] == ["s", "n", "x", "t", "i", "k", "c", "a"]
    symbols = [row[0] for row in catalog["rows"]]
    assert len(symbols) == len(set(symbols)) > 5000
    pattern = re.compile(SYMBOL_PATTERN)
    assert all(pattern.match(symbol) for symbol in symbols)
    isins = [row[4] for row in catalog["rows"] if row[4]]
    assert isins and all(re.match(r"^[A-Z]{2}[A-Z0-9]{9}[0-9]$", isin) and _isin_valid(isin) for isin in isins)
    assert len(gzip.compress(raw.encode("utf-8"))) <= 150 * 1024  # client chunk budget
    for symbol in ANCHORS:
        assert symbol in symbols, symbol


def test_lookup_resolve_and_offline_search():
    assert symbol_catalog.resolve_isin("INE002A01018") == "RELIANCE.NS"
    assert symbol_catalog.resolve_isin("in002a01018".upper()[:-1] + "9") is None
    assert symbol_catalog.lookup("reliance.ns")["sector"]
    assert symbol_catalog.search("tata consultancy")[0]["symbol"] == "TCS.NS"
    offline = build_offline_search("hdfc bank")
    assert offline[0]["symbol"] == "HDFCBANK.NS" and offline[0]["source"] == "offline"
