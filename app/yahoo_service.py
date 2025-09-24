"""Utilities for working with Yahoo Finance via :mod:`yfinance`.

This module centralises all interactions with Yahoo Finance, providing
lightweight caching and consistent error handling so the API surface used by
FastAPI endpoints stays resilient.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

import pandas as pd
import yfinance as yf

__all__ = [
    "YahooFinanceError",
    "PriceSnapshot",
    "get_price_snapshot",
    "get_bulk_price_snapshots",
    "get_company_profile",
    "get_index_quote",
    "get_news_items",
    "get_technical_indicators",
    "get_major_holders",
    "get_earnings_history",
    "search_symbol",
    "get_price_history",
]


class YahooFinanceError(RuntimeError):
    """Base exception raised when data cannot be retrieved from Yahoo Finance."""


@dataclass
class PriceSnapshot:
    """A concise representation of the latest quote for a symbol."""

    symbol: str
    price: float
    previous_close: float
    volume: int
    timestamp: datetime

    @property
    def change(self) -> float:
        return self.price - self.previous_close

    @property
    def change_percent(self) -> float:
        return (self.change / self.previous_close * 100) if self.previous_close else 0.0


_CACHE_TTL = timedelta(seconds=30)
_price_cache: Dict[str, Tuple[PriceSnapshot, datetime]] = {}
_profile_cache: Dict[str, Tuple[Dict[str, Any], datetime]] = {}
_history_cache: Dict[Tuple[str, str, str], Tuple[pd.DataFrame, datetime]] = {}


def _normalise_symbol(symbol: str) -> str:
    if not symbol:
        raise YahooFinanceError("A symbol must be provided")
    return symbol.strip().upper()


def _is_cache_valid(entry_time: datetime) -> bool:
    return datetime.utcnow() - entry_time < _CACHE_TTL


def _cache_get(cache: Dict[Any, Tuple[Any, datetime]], key: Any) -> Optional[Any]:
    value = cache.get(key)
    if value:
        payload, stored_at = value
        if _is_cache_valid(stored_at):
            return payload
    return None


def _cache_set(cache: Dict[Any, Tuple[Any, datetime]], key: Any, value: Any) -> None:
    cache[key] = (value, datetime.utcnow())


def _download_history(symbol: str, period: str, interval: str) -> pd.DataFrame:
    cache_key = (symbol, period, interval)
    cached = _cache_get(_history_cache, cache_key)
    if cached is not None:
        return cached

    data = yf.download(symbol, period=period, interval=interval, progress=False)
    if data.empty:
        raise YahooFinanceError(f"No historical data returned for {symbol}")

    _cache_set(_history_cache, cache_key, data)
    return data


def get_price_snapshot(symbol: str) -> PriceSnapshot:
    symbol = _normalise_symbol(symbol)
    cached = _cache_get(_price_cache, symbol)
    if cached is not None:
        return cached

    history = yf.Ticker(symbol).history(period="2d", interval="1d")
    if history.empty:
        raise YahooFinanceError(f"Unable to fetch price history for {symbol}")

    latest = history.iloc[-1]
    previous = history.iloc[-2] if len(history) > 1 else latest

    snapshot = PriceSnapshot(
        symbol=symbol,
        price=float(latest.get("Close", latest.get("Adj Close", 0.0))),
        previous_close=float(previous.get("Close", previous.get("Adj Close", 0.0))),
        volume=int(latest.get("Volume", 0) or 0),
        timestamp=datetime.utcnow(),
    )

    _cache_set(_price_cache, symbol, snapshot)
    return snapshot


def get_bulk_price_snapshots(symbols: Iterable[str]) -> List[PriceSnapshot]:
    normalised = [_normalise_symbol(sym) for sym in symbols]
    result: List[PriceSnapshot] = []
    missing: List[str] = []

    for symbol in normalised:
        cached = _cache_get(_price_cache, symbol)
        if cached is not None:
            result.append(cached)
        else:
            missing.append(symbol)

    if missing:
        data = yf.download(missing, period="2d", progress=False, group_by="ticker")
        for symbol in missing:
            try:
                if symbol in data:
                    history = data[symbol]
                else:
                    history = data  # When only one symbol is requested yfinance flattens the frame
                if history.empty:
                    raise YahooFinanceError("empty history")

                latest = history.iloc[-1]
                previous = history.iloc[-2] if len(history) > 1 else latest
                snapshot = PriceSnapshot(
                    symbol=symbol,
                    price=float(latest.get("Close", latest.get("Adj Close", 0.0))),
                    previous_close=float(previous.get("Close", previous.get("Adj Close", 0.0))),
                    volume=int(latest.get("Volume", 0) or 0),
                    timestamp=datetime.utcnow(),
                )
                _cache_set(_price_cache, symbol, snapshot)
                result.append(snapshot)
            except Exception as exc:  # pragma: no cover - defensive branch
                raise YahooFinanceError(f"Unable to fetch price for {symbol}: {exc}") from exc

    symbol_index = {sym: idx for idx, sym in enumerate(normalised)}
    result.sort(key=lambda snap: symbol_index[snap.symbol])
    return result


def get_company_profile(symbol: str) -> Dict[str, Any]:
    symbol = _normalise_symbol(symbol)
    cached = _cache_get(_profile_cache, symbol)
    if cached is not None:
        return cached

    ticker = yf.Ticker(symbol)
    try:
        info: Dict[str, Any] = ticker.get_info()  # type: ignore[assignment]
    except Exception as exc:  # pragma: no cover - yfinance network errors
        raise YahooFinanceError(f"Failed to load company profile for {symbol}: {exc}") from exc

    cleaned = {
        "symbol": symbol,
        "name": info.get("longName") or info.get("shortName") or symbol,
        "sector": info.get("sector", ""),
        "industry": info.get("industry", ""),
        "market_cap": float(info.get("marketCap") or 0),
        "pe_ratio": float(info.get("forwardPE") or info.get("trailingPE") or 0),
        "dividend_yield": float(info.get("dividendYield") or 0) * 100,
        "beta": float(info.get("beta") or 0),
        "fifty_two_week_high": float(info.get("fiftyTwoWeekHigh") or 0),
        "fifty_two_week_low": float(info.get("fiftyTwoWeekLow") or 0),
    }

    _cache_set(_profile_cache, symbol, cleaned)
    return cleaned


def get_index_quote(symbol: str) -> Dict[str, Any]:
    history = _download_history(symbol, period="1d", interval="1d")
    latest = history.iloc[-1]
    return {
        "symbol": symbol,
        "date": latest.name.strftime("%Y-%m-%d %H:%M:%S"),
        "open": float(latest.get("Open", 0)),
        "high": float(latest.get("High", 0)),
        "low": float(latest.get("Low", 0)),
        "close": float(latest.get("Close", latest.get("Adj Close", 0))),
        "volume": int(latest.get("Volume", 0) or 0),
    }


def get_news_items(symbol: str, limit: int = 20) -> List[Dict[str, Any]]:
    ticker = yf.Ticker(_normalise_symbol(symbol))
    news = getattr(ticker, "news", None) or []

    parsed: List[Dict[str, Any]] = []
    for item in news:
        try:
            title = item.get("title")
            summary = item.get("summary")
            source = item.get("source")
            link = item.get("link")
            if not all([title, summary, source, link]):
                continue

            publish_time = item.get("providerPublishTime")
            if publish_time:
                timestamp = datetime.fromtimestamp(publish_time)
            else:
                timestamp = datetime.utcnow()

            parsed.append(
                {
                    "title": title,
                    "summary": summary,
                    "source": source,
                    "published_at": timestamp.isoformat(),
                    "url": link,
                }
            )
        except Exception:  # pragma: no cover - ignore malformed entries
            continue

    parsed.sort(key=lambda entry: entry["published_at"], reverse=True)
    return parsed[:limit]


def get_technical_indicators(symbol: str) -> Dict[str, float]:
    history = yf.Ticker(_normalise_symbol(symbol)).history(period="1y")
    if history.empty or len(history) < 50:
        raise YahooFinanceError("Not enough historical data to compute indicators")

    close = history["Close"]
    delta = close.diff()
    gain = delta.where(delta > 0, 0.0).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0.0)).rolling(window=14).mean()
    rs = gain / loss.replace({0: pd.NA})
    rsi = 100 - (100 / (1 + rs))

    exp1 = close.ewm(span=12, adjust=False).mean()
    exp2 = close.ewm(span=26, adjust=False).mean()
    macd = exp1 - exp2
    signal = macd.ewm(span=9, adjust=False).mean()
    hist_macd = macd - signal

    sma_20 = close.rolling(window=20).mean()
    sma_50 = close.rolling(window=50).mean()

    return {
        "rsi": float(rsi.dropna().iloc[-1]),
        "macd": float(macd.dropna().iloc[-1]),
        "macd_signal": float(signal.dropna().iloc[-1]),
        "macd_hist": float(hist_macd.dropna().iloc[-1]),
        "sma_20": float(sma_20.dropna().iloc[-1]),
        "sma_50": float(sma_50.dropna().iloc[-1]),
    }


def get_major_holders(symbol: str) -> List[Dict[str, Any]]:
    holders = yf.Ticker(_normalise_symbol(symbol)).major_holders
    if holders is None or holders.empty:
        return []

    results: List[Dict[str, Any]] = []
    for _, row in holders.iterrows():
        category = row.iloc[0] if len(row) > 0 else ""
        percentage = float(row.iloc[1]) if len(row) > 1 else 0.0
        value = float(row.iloc[2]) if len(row) > 2 else 0.0
        results.append({"category": category, "percentage": percentage, "value": value})
    return results


def get_earnings_history(symbol: str) -> List[Dict[str, Any]]:
    ticker = yf.Ticker(_normalise_symbol(symbol))
    earnings = getattr(ticker, "earnings", None)
    if earnings is None or earnings.empty:
        return []

    rows: List[Dict[str, Any]] = []
    for index, row in earnings.iterrows():
        rows.append(
            {
                "date": index.isoformat() if hasattr(index, "isoformat") else str(index),
                "revenue": float(row.get("Revenue", 0)),
                "earnings": float(row.get("Earnings", 0)),
                "earnings_per_share": float(row.get("Earnings Per Share", 0)),
            }
        )
    return rows


def search_symbol(query: str) -> Dict[str, Any]:
    symbol = _normalise_symbol(query)
    try:
        profile = get_company_profile(symbol)
    except YahooFinanceError:
        profile = {"symbol": symbol, "name": symbol, "sector": "", "industry": ""}
    return profile


def get_price_history(symbol: str, period: str, interval: str) -> List[Dict[str, Any]]:
    history = _download_history(_normalise_symbol(symbol), period=period, interval=interval)
    records: List[Dict[str, Any]] = []
    for timestamp, row in history.iterrows():
        records.append(
            {
                "timestamp": timestamp.to_pydatetime().isoformat(),
                "price": float(row.get("Close", row.get("Adj Close", 0.0))),
                "open": float(row.get("Open", 0.0)),
                "high": float(row.get("High", 0.0)),
                "low": float(row.get("Low", 0.0)),
                "volume": int(row.get("Volume", 0) or 0),
            }
        )
    return records
