"""Market data: quotes, OHLCV history, symbol search.

Chain: yfinance -> Yahoo's public HTTP API -> clearly flagged offline/synthetic fallback.
Every payload carries `source` ("live" | "offline" | "synthetic"). The sync fetchers are
wrapped by async, cached accessors (`get_quotes`, `get_chart`, `search`, `get_daily_history`)
so route handlers never block the event loop. The cache is per process today; a shared
Redis backend plugs in behind `CacheBackend` for multi-instance hosting.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import tempfile
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Protocol, Tuple

import requests
from urllib.parse import quote
from fastapi import HTTPException

from backend.config import settings
from backend.services import upstash
from backend.services.clock import now

logger = logging.getLogger("algo_trade_backend.market")

try:
    import yfinance as yf
except ModuleNotFoundError:
    yf = None

# yfinance caches timezone/cookie data under the home directory by default, which is
# read-only on serverless hosts. The temp dir is the only writable location there.
if yf is not None and hasattr(yf, "set_tz_cache_location"):
    try:
        yf.set_tz_cache_location(os.path.join(tempfile.gettempdir(), "algo-trade-yfinance-cache"))
    except Exception:  # noqa: BLE001 - cache location is an optimisation, never fatal
        pass


OFFLINE_QUOTES = {
    "AAPL": {
        "symbol": "AAPL",
        "price": 182.54,
        "previousClose": 181.82,
        "currency": "USD",
    },
    "MSFT": {
        "symbol": "MSFT",
        "price": 327.31,
        "previousClose": 326.78,
        "currency": "USD",
    },
    "GOOGL": {
        "symbol": "GOOGL",
        "price": 141.05,
        "previousClose": 140.44,
        "currency": "USD",
    },
    "AMZN": {
        "symbol": "AMZN",
        "price": 135.13,
        "previousClose": 134.88,
        "currency": "USD",
    },
    "TSLA": {
        "symbol": "TSLA",
        "price": 253.24,
        "previousClose": 255.12,
        "currency": "USD",
    },
    "NVDA": {
        "symbol": "NVDA",
        "price": 448.67,
        "previousClose": 452.11,
        "currency": "USD",
    },
    "RELIANCE.NS": {
        "symbol": "RELIANCE.NS",
        "price": 2461.45,
        "previousClose": 2458.30,
        "currency": "INR",
    },
}


def yahoo_headers() -> Dict[str, str]:
    return {"User-Agent": settings.yahoo_user_agent, "Accept": "application/json"}


# Last observed market-data provenance for this process. Per-instance by nature; surfaced by
# /api/status so the UI can show whether data is currently live or coming from fallbacks.
MARKET_HEALTH: Dict[str, Optional[str]] = {"lastSource": None, "lastLiveAt": None, "lastFallbackAt": None}


def record_market_source(source: str) -> None:
    MARKET_HEALTH["lastSource"] = source
    key = "lastLiveAt" if source == "live" else "lastFallbackAt"
    MARKET_HEALTH[key] = now().isoformat()


def offline_quotes_or_error(symbols: List[str]) -> List[Dict[str, Any]]:
    if not settings.allow_offline_market_data:
        raise HTTPException(status_code=502, detail="Quote service unavailable")
    record_market_source("offline")
    return build_offline_quotes(symbols)


def fetch_quotes(symbols: List[str]) -> List[Dict[str, Any]]:
    if not symbols:
        return []

    collected: List[Dict[str, Any]] = []
    remaining = [symbol.upper() for symbol in symbols]

    if yf is not None:
        try:
            collected = fetch_quotes_with_yfinance(remaining)
            found = {quote["symbol"] for quote in collected}
            remaining = [symbol.upper() for symbol in symbols if symbol.upper() not in found]
        except Exception as exc:  # noqa: BLE001
            logger.warning("yfinance quote fetch failed: %s", exc)
            remaining = [symbol.upper() for symbol in symbols]

    if not remaining:
        record_market_source("live")
        return collected

    url = "https://query1.finance.yahoo.com/v7/finance/quote"
    params = {"symbols": ",".join(remaining)}
    try:
        response = requests.get(url, params=params, headers=yahoo_headers(), timeout=10)
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Quote service error for %s: %s", remaining, exc, exc_info=True)
        return collected + offline_quotes_or_error(remaining)

    data = response.json()
    results = data.get("quoteResponse", {}).get("result", [])
    timestamp = now().isoformat()
    for entry in results:
        price = entry.get("regularMarketPrice")
        previous_close = entry.get("regularMarketPreviousClose")
        change = None
        change_percent = None
        if price is not None and previous_close not in (None, 0):
            change = price - previous_close
            change_percent = (change / previous_close) * 100 if previous_close else None
        collected.append(
            {
                "symbol": entry.get("symbol"),
                "price": price,
                "change": change,
                "changePercent": change_percent,
                "previousClose": previous_close,
                "currency": entry.get("currency"),
                "updated": timestamp,
                "source": "live",
            }
        )

    requested_symbols = [symbol.upper() for symbol in symbols]
    merged: Dict[str, Dict[str, Any]] = {}
    for quote in collected:
        symbol = str(quote.get("symbol", "") or "").upper()
        if not symbol:
            continue
        merged[symbol] = quote | {"symbol": symbol}

    missing = [symbol for symbol in requested_symbols if symbol not in merged]
    if missing:
        offline_quotes = offline_quotes_or_error(missing)
        for quote in offline_quotes:
            symbol = str(quote.get("symbol", "") or "").upper()
            if not symbol or symbol in merged:
                continue
            merged[symbol] = quote | {"symbol": symbol}

    ordered_quotes = [merged[symbol] for symbol in requested_symbols if symbol in merged]
    if ordered_quotes:
        if not missing:
            record_market_source("live")
        return ordered_quotes

    return offline_quotes_or_error(requested_symbols)


def fetch_chart(symbol: str, range_value: str = "1mo", interval: str = "1d") -> Dict[str, Any]:
    if yf is not None:
        try:
            chart = fetch_chart_with_yfinance(symbol, range_value, interval)
            if chart["points"]:
                record_market_source("live")
                return chart
        except Exception as exc:  # noqa: BLE001
            logger.warning("yfinance chart fetch failed for %s: %s", symbol, exc)
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(symbol, safe='^=.-')}"
    params = {
        "range": range_value,
        "interval": interval,
        "includePrePost": "false",
    }
    try:
        response = requests.get(url, params=params, headers=yahoo_headers(), timeout=10)
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Chart service error for %s: %s", symbol, exc)
        if settings.allow_offline_market_data:
            record_market_source("offline")
            return build_offline_chart(symbol, range_value, interval)
        raise HTTPException(status_code=502, detail="Chart service unavailable") from exc
    data = response.json()
    result = (data.get("chart") or {}).get("result")
    if not result:
        if settings.allow_offline_market_data:
            record_market_source("offline")
            return build_offline_chart(symbol, range_value, interval)
        raise HTTPException(status_code=404, detail=f"No chart data for {symbol}")
    chart = result[0]
    timestamps = chart.get("timestamp") or []
    indicators = chart.get("indicators") or {}
    quote = (indicators.get("quote") or [{}])[0]
    opens = quote.get("open") or []
    highs = quote.get("high") or []
    lows = quote.get("low") or []
    closes = quote.get("close") or []
    volumes = quote.get("volume") or []
    points: List[Dict[str, Any]] = []
    for index, ts in enumerate(timestamps):
        if ts is None:
            continue
        close = closes[index] if index < len(closes) else None
        open_price = opens[index] if index < len(opens) else None
        high = highs[index] if index < len(highs) else None
        low = lows[index] if index < len(lows) else None
        volume = volumes[index] if index < len(volumes) else None
        if close is None or open_price is None or high is None or low is None:
            continue
        iso_timestamp = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        points.append(
            {
                "timestamp": iso_timestamp,
                "open": float(open_price),
                "high": float(high),
                "low": float(low),
                "close": float(close),
                "volume": int(volume) if volume is not None else None,
            }
        )
    meta = chart.get("meta") or {}
    record_market_source("live")
    return {
        "symbol": chart.get("meta", {}).get("symbol", symbol.upper()),
        "points": points,
        "timezone": meta.get("exchangeTimezoneName"),
        "currency": meta.get("currency"),
        "name": meta.get("longName") or meta.get("shortName"),
        "exchange": meta.get("fullExchangeName") or meta.get("exchangeName"),
        "instrumentType": meta.get("instrumentType"),
        "range": range_value,
        "interval": interval,
        "previousClose": meta.get("previousClose"),
        "source": "live",
    }


def search_symbols(query: str) -> List[Dict[str, Any]]:
    # Try yfinance first (handles Yahoo auth cookies automatically)
    if yf is not None:
        try:
            yf_results = fetch_search_with_yfinance(query)
            if yf_results:
                return yf_results
        except Exception as exc:  # noqa: BLE001
            logger.warning("yfinance search fallback failed: %s", exc)

    url = "https://query1.finance.yahoo.com/v1/finance/search"
    params = {"q": query, "quotesCount": 10, "newsCount": 0}
    try:
        response = requests.get(url, params=params, headers=yahoo_headers(), timeout=10)
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Search service error: %s", exc)
        return build_offline_search(query)
    data = response.json()
    results = data.get("quotes") or []
    output: List[Dict[str, Any]] = []
    for entry in results:
        symbol = entry.get("symbol")
        if not symbol:
            continue
        output.append(
            {
                "symbol": symbol,
                "shortName": entry.get("shortname"),
                "longName": entry.get("longname"),
                "exchange": entry.get("exchange"),
                "type": entry.get("quoteType"),
                "source": "live",
            }
        )
    return output


def build_offline_quotes(symbols: List[str]) -> List[Dict[str, Any]]:
    timestamp = now().isoformat()
    fallback: List[Dict[str, Any]] = []
    for symbol in symbols:
        base = OFFLINE_QUOTES.get(symbol.upper())
        if not base:
            base = {"symbol": symbol.upper(), "price": 100.0, "previousClose": 100.0, "currency": "USD"}
        price = float(base.get("price", 0.0))
        previous = float(base.get("previousClose", price))
        change = price - previous if previous else 0.0
        change_percent = (change / previous) * 100 if previous else 0.0
        fallback.append(
            {
                "symbol": base.get("symbol", symbol.upper()),
                "price": price,
                "change": change,
                "changePercent": change_percent,
                "previousClose": previous,
                "currency": base.get("currency", "USD"),
                "updated": timestamp,
                "source": "offline",
            }
        )
    return fallback


def build_offline_chart(symbol: str, range_value: str, interval: str) -> Dict[str, Any]:
    points: List[Dict[str, Any]] = []
    base_price = float(OFFLINE_QUOTES.get(symbol.upper(), {}).get("price", 100.0))
    for idx in range(60):
        close = base_price * (1 + 0.002 * (idx - 30) / 30)
        high = close * 1.01
        low = close * 0.99
        open_price = (high + low) / 2
        points.append(
            {
                "timestamp": (now() - timedelta(days=60 - idx)).isoformat(),
                "open": open_price,
                "high": high,
                "low": low,
                "close": close,
                "volume": 1000000 + idx * 2500,
            }
        )
    return {
        "symbol": symbol.upper(),
        "points": points,
        "timezone": "UTC",
        "currency": OFFLINE_QUOTES.get(symbol.upper(), {}).get("currency", "USD"),
        "range": range_value,
        "interval": interval,
        "previousClose": points[0]["close"],
        "source": "synthetic",
    }


def build_offline_search(query: str) -> List[Dict[str, Any]]:
    from backend.services import symbol_catalog

    catalog_hits = symbol_catalog.search(query, limit=10)
    if catalog_hits:
        # Real listings from the offline catalog; still flagged so the UI badges them.
        return [
            {"symbol": hit["symbol"], "shortName": hit["name"], "longName": hit["name"], "exchange": hit["exchange"], "type": hit["type"], "source": "offline"}
            for hit in catalog_hits
        ]
    matches: List[Dict[str, Any]] = []
    lowered = query.lower()
    for symbol, info in OFFLINE_QUOTES.items():
        label = info.get("symbol", symbol)
        if lowered in label.lower():
            matches.append(
                {
                    "symbol": label,
                    "shortName": label,
                    "exchange": "OFFLINE",
                    "type": "EQUITY",
                    "source": "offline",
                }
            )
    if not matches:
        matches.append(
            {
                "symbol": query.upper(),
                "shortName": query.upper(),
                "exchange": "OFFLINE",
                "type": "EQUITY",
                "source": "offline",
            }
        )
    return matches


def fetch_quotes_with_yfinance(symbols: List[str]) -> List[Dict[str, Any]]:
    if yf is None:
        return []
    results: List[Dict[str, Any]] = []
    timestamp = now().isoformat()
    for symbol in symbols:
        try:
            ticker = yf.Ticker(symbol)
            info = getattr(ticker, "fast_info", None)
            price = None
            previous = None
            currency = None
            if info is not None:
                try:
                    price = getattr(info, "last_price", None)
                except Exception:
                    pass
                if price is None:
                    try:
                        price = getattr(info, "last_close", None)
                    except Exception:
                        pass
                try:
                    previous = getattr(info, "previous_close", None)
                except Exception:
                    pass
                try:
                    currency = getattr(info, "currency", None)
                except Exception:
                    pass
            if price is None:
                history = ticker.history(period="5d", interval="1d")
                if not history.empty:
                    price = float(history["Close"].iloc[-1])
                    previous = float(history["Close"].iloc[-2]) if len(history) > 1 else price
            if price is None:
                continue
            if previous is None:
                previous = price
            change = price - previous if previous else 0.0
            change_percent = (change / previous) * 100 if previous else 0.0
            results.append(
                {
                    "symbol": symbol.upper(),
                    "price": float(price),
                    "change": float(change),
                    "changePercent": float(change_percent),
                    "previousClose": float(previous) if previous is not None else None,
                    "currency": currency,
                    "updated": timestamp,
                    "source": "live",
                }
            )
        except Exception as exc:
            logger.warning("yfinance quote for %s failed: %s", symbol, exc)
            continue
    return results


def fetch_chart_with_yfinance(symbol: str, range_value: str, interval: str) -> Dict[str, Any]:
    if yf is None:
        return build_offline_chart(symbol, range_value, interval)
    ticker = yf.Ticker(symbol)
    history = ticker.history(period=range_value, interval=interval)
    if history.empty:
        raise ValueError("No history returned")
    points: List[Dict[str, Any]] = []
    for timestamp, row in history.iterrows():
        open_price = float(row.get("Open", float("nan")))
        high = float(row.get("High", float("nan")))
        low = float(row.get("Low", float("nan")))
        close = float(row.get("Close", float("nan")))
        volume_val = row.get("Volume", float("nan"))
        volume = None if math.isnan(volume_val) else int(volume_val)
        if any(math.isnan(value) for value in (open_price, high, low, close)):
            continue
        if timestamp.tzinfo is None:
            ts = timestamp.replace(tzinfo=timezone.utc)
        else:
            ts = timestamp.tz_convert(timezone.utc)
        points.append(
            {
                "timestamp": ts.isoformat(),
                "open": open_price,
                "high": high,
                "low": low,
                "close": close,
                "volume": volume,
            }
        )
    # history_metadata comes with the history response; fast_info would cost another request.
    metadata = getattr(ticker, "history_metadata", None)
    if not isinstance(metadata, dict):
        metadata = {}
    return {
        "symbol": symbol.upper(),
        "points": points,
        "timezone": str(history.index.tz) if history.index.tz is not None else "UTC",
        "currency": metadata.get("currency"),
        "name": metadata.get("longName") or metadata.get("shortName"),
        "exchange": metadata.get("fullExchangeName") or metadata.get("exchangeName"),
        "instrumentType": metadata.get("instrumentType"),
        "range": range_value,
        "interval": interval,
        "previousClose": points[0]["close"] if points else None,
        "source": "live",
    }


def fetch_search_with_yfinance(query: str) -> List[Dict[str, Any]]:
    if yf is None:
        return []
    try:
        if hasattr(yf, "Search"):  # yfinance >= 0.2.50 (`yf.search` is a module there, not a function)
            search_result = yf.Search(query, max_results=10, news_count=0, lists_count=0, raise_errors=False).quotes
        elif callable(getattr(yf, "search", None)):
            search_result = yf.search(query)
        else:
            search_result = None
    except Exception as exc:  # noqa: BLE001
        logger.warning("yfinance search raised: %s", exc)
        search_result = None
    items: list = []
    if isinstance(search_result, dict):
        items = search_result.get("quotes", [])
    elif isinstance(search_result, list):
        items = search_result
    matches: List[Dict[str, Any]] = []
    for item in items[:10]:
        if not isinstance(item, dict):
            continue
        symbol = item.get('symbol')
        if not symbol:
            continue
        matches.append({
            'symbol': symbol,
            'shortName': item.get('shortname') or item.get('shortName') or item.get('longname') or item.get('longName'),
            'longName': item.get('longname') or item.get('longName'),
            'exchange': item.get('exchange'),
            'type': item.get('quoteType'),
            'source': 'live',
        })
    if matches:
        return matches
    return build_offline_search(query)


# Caching ---------------------------------------------------------------------------------------
class CacheBackend(Protocol):
    def get(self, key: str) -> Optional[Any]: ...

    def set(self, key: str, value: Any, ttl_seconds: float) -> None: ...


class MemoryTTLCache:
    """Small per-process TTL cache. Bounded so a long-lived dev server can't grow forever."""

    def __init__(self, max_entries: int = 512) -> None:
        self._entries: Dict[str, Tuple[float, Any]] = {}
        self._max_entries = max_entries

    def get(self, key: str) -> Optional[Any]:
        entry = self._entries.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if expires_at < time.monotonic():
            self._entries.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any, ttl_seconds: float) -> None:
        if len(self._entries) >= self._max_entries:
            current = time.monotonic()
            for stale in [k for k, (exp, _) in self._entries.items() if exp < current]:
                self._entries.pop(stale, None)
            if len(self._entries) >= self._max_entries:
                self._entries.pop(next(iter(self._entries)))
        self._entries[key] = (time.monotonic() + ttl_seconds, value)


class UpstashCache:
    """Shared cache across serverless instances (JSON values with TTL). Fails open on errors."""

    remote = True

    def get(self, key: str) -> Optional[Any]:
        try:
            raw = upstash.command("GET", f"cache:{key}")
            return json.loads(raw) if raw else None
        except Exception:  # noqa: BLE001 - a cache outage must never break market data
            logger.warning("Shared cache read failed; continuing without cache")
            return None

    def set(self, key: str, value: Any, ttl_seconds: float) -> None:
        try:
            upstash.command("SET", f"cache:{key}", json.dumps(value, default=str), "EX", max(1, int(ttl_seconds)))
        except Exception:  # noqa: BLE001
            logger.warning("Shared cache write failed; continuing without cache")


def _build_cache() -> CacheBackend:
    if upstash.configured():
        logger.info("Market data cache: shared (Upstash Redis)")
        return UpstashCache()
    return MemoryTTLCache()


_cache: CacheBackend = _build_cache()


async def _cache_get(key: str) -> Optional[Any]:
    if getattr(_cache, "remote", False):
        return await asyncio.to_thread(_cache.get, key)
    return _cache.get(key)


async def _cache_set(key: str, value: Any, ttl_seconds: float) -> None:
    if getattr(_cache, "remote", False):
        await asyncio.to_thread(_cache.set, key, value, ttl_seconds)
    else:
        _cache.set(key, value, ttl_seconds)

QUOTE_TTL_SECONDS = 15
INTRADAY_CHART_TTL_SECONDS = 60
DAILY_CHART_TTL_SECONDS = 300
SEARCH_TTL_SECONDS = 600
INTRADAY_INTERVALS = {"1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"}


def _cacheable(payload: Any) -> bool:
    """Only cache live data, so a provider hiccup isn't pinned in place for minutes."""
    if isinstance(payload, dict):
        return payload.get("source") == "live"
    if isinstance(payload, list):
        return bool(payload) and all(isinstance(item, dict) and item.get("source") == "live" for item in payload)
    return False


async def get_quotes(symbols: List[str]) -> List[Dict[str, Any]]:
    key = "quotes:" + ",".join(symbol.upper() for symbol in symbols)
    cached = await _cache_get(key)
    if cached is not None:
        return cached
    quotes = await asyncio.to_thread(fetch_quotes, symbols)
    if _cacheable(quotes):
        await _cache_set(key, quotes, QUOTE_TTL_SECONDS)
    return quotes


async def get_chart(symbol: str, range_value: str = "1mo", interval: str = "1d") -> Dict[str, Any]:
    key = f"chart:{symbol.upper()}:{range_value}:{interval}"
    cached = await _cache_get(key)
    if cached is not None:
        return cached
    chart = await asyncio.to_thread(fetch_chart, symbol, range_value, interval)
    if _cacheable(chart):
        ttl = INTRADAY_CHART_TTL_SECONDS if interval in INTRADAY_INTERVALS else DAILY_CHART_TTL_SECONDS
        await _cache_set(key, chart, ttl)
    return chart


async def search(query: str) -> List[Dict[str, Any]]:
    key = f"search:{query.strip().lower()}"
    cached = await _cache_get(key)
    if cached is not None:
        return cached
    results = await asyncio.to_thread(search_symbols, query)
    if _cacheable(results):
        await _cache_set(key, results, SEARCH_TTL_SECONDS)
    return results


async def get_daily_history(symbol: str, range_value: str) -> Dict[str, Any]:
    """Daily, auto-adjusted OHLCV for analytics. Same payload shape as get_chart."""
    return await get_chart(symbol, range_value, "1d")
