"""FastAPI routes that expose real-time and historical market data."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Dict, List

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from yahoo_service import (
    YahooFinanceError,
    get_company_profile,
    get_earnings_history,
    get_index_quote,
    get_major_holders,
    get_news_items,
    get_price_history,
    get_price_snapshot,
    get_technical_indicators,
    search_symbol,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app4_router = APIRouter()


class ConnectionManager:
    """Tracks active WebSocket connections per stock symbol."""

    def __init__(self) -> None:
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.connection_tasks: Dict[str, asyncio.Task] = {}

    async def connect(self, websocket: WebSocket, symbol: str) -> None:
        await websocket.accept()
        self.active_connections.setdefault(symbol, []).append(websocket)

    def disconnect(self, websocket: WebSocket, symbol: str) -> None:
        if symbol not in self.active_connections:
            return
        connections = self.active_connections[symbol]
        if websocket in connections:
            connections.remove(websocket)
        if not connections:
            self.active_connections.pop(symbol, None)
            task = self.connection_tasks.pop(symbol, None)
            if task:
                task.cancel()

    async def broadcast(self, symbol: str, message: Dict) -> None:
        if symbol not in self.active_connections:
            return

        dead_connections: List[WebSocket] = []
        for connection in self.active_connections[symbol]:
            try:
                await connection.send_json(message)
            except Exception as exc:  # pragma: no cover - network error
                logger.error("Error sending message to WebSocket: %s", exc)
                dead_connections.append(connection)

        for connection in dead_connections:
            self.disconnect(connection, symbol)

    async def start_stock_updates(self, symbol: str) -> None:
        if symbol in self.connection_tasks:
            return

        async def update_stock_data() -> None:
            while True:
                try:
                    if symbol not in self.active_connections:
                        break

                    snapshot = get_price_snapshot(symbol)
                    await self.broadcast(
                        symbol,
                        {
                            "price": snapshot.price,
                            "change": snapshot.change,
                            "change_percent": snapshot.change_percent,
                            "volume": snapshot.volume,
                            "timestamp": snapshot.timestamp.isoformat(),
                        },
                    )
                    await asyncio.sleep(5)
                except YahooFinanceError as exc:
                    logger.error("Yahoo Finance error for %s: %s", symbol, exc)
                    await self.broadcast(
                        symbol,
                        {
                            "error": "Unable to fetch stock data",
                            "timestamp": datetime.utcnow().isoformat(),
                        },
                    )
                    await asyncio.sleep(5)
                except Exception as exc:  # pragma: no cover - defensive catch
                    logger.error("Error in WebSocket update for %s: %s", symbol, exc)
                    await self.broadcast(
                        symbol,
                        {
                            "error": "Error updating stock data",
                            "timestamp": datetime.utcnow().isoformat(),
                        },
                    )
                    await asyncio.sleep(5)

        self.connection_tasks[symbol] = asyncio.create_task(update_stock_data())


manager = ConnectionManager()


class StockData(BaseModel):
    symbol: str
    price: float
    change: float
    change_percent: float
    volume: int
    timestamp: datetime


class TechnicalIndicators(BaseModel):
    symbol: str
    rsi: float
    macd: float
    macd_signal: float
    macd_hist: float
    sma_20: float
    sma_50: float
    timestamp: datetime


class CompanyInfo(BaseModel):
    symbol: str
    name: str
    sector: str
    industry: str
    market_cap: float
    pe_ratio: float
    dividend_yield: float
    beta: float
    fifty_two_week_high: float
    fifty_two_week_low: float


class NewsItem(BaseModel):
    title: str
    summary: str
    source: str
    timestamp: datetime
    url: str


def validate_stock_symbol(symbol: str) -> bool:
    try:
        get_price_snapshot(symbol)
        return True
    except YahooFinanceError:
        return False


@app4_router.websocket("/ws/{symbol}")
async def websocket_endpoint(websocket: WebSocket, symbol: str) -> None:
    if not validate_stock_symbol(symbol):
        await websocket.close(code=4004, reason=f"Invalid stock symbol: {symbol}")
        return

    await manager.connect(websocket, symbol)
    await manager.start_stock_updates(symbol)

    try:
        while True:
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
            except Exception:
                break
    finally:
        manager.disconnect(websocket, symbol)


@app4_router.get("/")
async def root() -> Dict[str, str]:
    return {"message": "Welcome to Stock Trading API"}


@app4_router.get("/stock/{symbol}", response_model=StockData)
async def get_stock_data(symbol: str) -> StockData:
    try:
        snapshot = get_price_snapshot(symbol)
        return StockData(
            symbol=snapshot.symbol,
            price=snapshot.price,
            change=snapshot.change,
            change_percent=snapshot.change_percent,
            volume=snapshot.volume,
            timestamp=snapshot.timestamp,
        )
    except YahooFinanceError as exc:
        logger.error("Error fetching stock data for %s: %s", symbol, exc)
        raise HTTPException(status_code=500, detail=f"Error fetching data for {symbol}: {exc}")


@app4_router.get("/stock/{symbol}/technical", response_model=TechnicalIndicators)
async def get_technical_indicators_endpoint(symbol: str) -> TechnicalIndicators:
    try:
        indicators = get_technical_indicators(symbol)
        return TechnicalIndicators(
            symbol=symbol,
            rsi=indicators["rsi"],
            macd=indicators["macd"],
            macd_signal=indicators["macd_signal"],
            macd_hist=indicators["macd_hist"],
            sma_20=indicators["sma_20"],
            sma_50=indicators["sma_50"],
            timestamp=datetime.utcnow(),
        )
    except YahooFinanceError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Error calculating technical indicators for {symbol}: {exc}",
        )


@app4_router.get("/stock/{symbol}/info", response_model=CompanyInfo)
async def get_company_info(symbol: str) -> CompanyInfo:
    try:
        profile = get_company_profile(symbol)
        return CompanyInfo(
            symbol=profile["symbol"],
            name=profile["name"],
            sector=profile["sector"],
            industry=profile["industry"],
            market_cap=profile["market_cap"],
            pe_ratio=profile["pe_ratio"],
            dividend_yield=profile["dividend_yield"],
            beta=profile["beta"],
            fifty_two_week_high=profile["fifty_two_week_high"],
            fifty_two_week_low=profile["fifty_two_week_low"],
        )
    except YahooFinanceError as exc:
        raise HTTPException(status_code=404, detail=f"Error fetching company info for {symbol}: {exc}")


@app4_router.get("/stock/{symbol}/history")
async def get_stock_history(symbol: str, timeframe: str = "1d") -> List[Dict[str, float]]:
    try:
        if not validate_stock_symbol(symbol):
            raise HTTPException(status_code=404, detail=f"Invalid or unavailable stock symbol: {symbol}")

        period_map = {
            "1D": ("1d", "1m"),
            "1W": ("5d", "5m"),
            "1M": ("1mo", "1h"),
            "3M": ("3mo", "1d"),
            "1Y": ("1y", "1d"),
        }
        period, interval = period_map.get(timeframe, ("1d", "1m"))
        return get_price_history(symbol, period=period, interval=interval)
    except YahooFinanceError as exc:
        logger.error("Error fetching history for %s: %s", symbol, exc)
        raise HTTPException(status_code=500, detail=f"Error fetching history for {symbol}: {exc}")


@app4_router.get("/stock/{symbol}/news", response_model=List[NewsItem])
async def get_stock_news(symbol: str) -> List[NewsItem]:
    try:
        news = get_news_items(symbol)
        return [
            NewsItem(
                title=item["title"],
                summary=item["summary"],
                source=item["source"],
                timestamp=datetime.fromisoformat(item["published_at"]),
                url=item["url"],
            )
            for item in news
        ]
    except YahooFinanceError as exc:
        logger.error("Error fetching news for %s: %s", symbol, exc)
        raise HTTPException(status_code=404, detail=f"Error fetching news for {symbol}: {exc}")


@app4_router.get("/stock/{symbol}/major_holders")
async def get_major_holders_endpoint(symbol: str):
    try:
        holders = get_major_holders(symbol)
        if not holders:
            return {"message": "No major holders data available"}
        return holders
    except YahooFinanceError as exc:
        raise HTTPException(status_code=404, detail=f"Error fetching major holders for {symbol}: {exc}")


@app4_router.get("/stock/{symbol}/earnings")
async def get_earnings(symbol: str):
    try:
        earnings = get_earnings_history(symbol)
        if not earnings:
            return {"message": "No earnings data available"}
        return earnings
    except YahooFinanceError as exc:
        raise HTTPException(status_code=404, detail=f"Error fetching earnings for {symbol}: {exc}")


@app4_router.get("/nifty50")
async def get_nifty50():
    try:
        return get_index_quote("^NSEI")
    except YahooFinanceError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app4_router.get("/sensex")
async def get_sensex():
    try:
        return get_index_quote("^BSESN")
    except YahooFinanceError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app4_router.get("/banknifty")
async def get_banknifty():
    try:
        return get_index_quote("^NSEBANK")
    except YahooFinanceError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app4_router.get("/search/{query}")
async def search_stocks(query: str):
    try:
        return search_symbol(query)
    except YahooFinanceError as exc:
        raise HTTPException(status_code=404, detail=f"Error searching for {query}: {exc}")
