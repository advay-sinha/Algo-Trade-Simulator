from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
from typing import List, Optional, Dict
from pydantic import BaseModel
from datetime import datetime
import pandas as pd
import numpy as np
import asyncio
import json
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
import logging
from fastapi import APIRouter

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app4_router = APIRouter()

# Store active WebSocket connections
active_connections: Dict[str, List[WebSocket]] = {}

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.connection_tasks: Dict[str, asyncio.Task] = {}

    async def connect(self, websocket: WebSocket, symbol: str):
        await websocket.accept()
        if symbol not in self.active_connections:
            self.active_connections[symbol] = []
        self.active_connections[symbol].append(websocket)

    def disconnect(self, websocket: WebSocket, symbol: str):
        if symbol in self.active_connections:
            self.active_connections[symbol].remove(websocket)
            if not self.active_connections[symbol]:
                del self.active_connections[symbol]
                if symbol in self.connection_tasks:
                    self.connection_tasks[symbol].cancel()
                    del self.connection_tasks[symbol]

    async def broadcast(self, symbol: str, message: dict):
        if symbol in self.active_connections:
            dead_connections = []
            for connection in self.active_connections[symbol]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending message to WebSocket: {str(e)}")
                    dead_connections.append(connection)
            
            # Remove dead connections
            for connection in dead_connections:
                self.disconnect(connection, symbol)

    async def start_stock_updates(self, symbol: str):
        if symbol in self.connection_tasks:
            return
            
        async def update_stock_data():
            while True:
                try:
                    if symbol not in self.active_connections:
                        break
                        
                    stock = yf.Ticker(symbol)
                    info = stock.info
                    
                    if not info or not isinstance(info, dict):
                        await self.broadcast(symbol, {
                            "error": "Invalid stock data received",
                            "timestamp": datetime.now().isoformat()
                        })
                        await asyncio.sleep(5)
                        continue
                    
                    if not info.get('regularMarketPrice'):
                        await self.broadcast(symbol, {
                            "error": "Unable to fetch stock data",
                            "timestamp": datetime.now().isoformat()
                        })
                        await asyncio.sleep(5)
                        continue
                    
                    current_price = info.get('regularMarketPrice', 0)
                    previous_close = info.get('previousClose', 0)
                    change = current_price - previous_close
                    change_percent = (change / previous_close) * 100 if previous_close else 0
                    
                    data = {
                        "price": current_price,
                        "change": change,
                        "change_percent": change_percent,
                        "volume": info.get('regularMarketVolume', 0),
                        "timestamp": datetime.now().isoformat()
                    }
                    
                    await self.broadcast(symbol, data)
                    await asyncio.sleep(5)
                    
                except Exception as e:
                    logger.error(f"Error in WebSocket update for {symbol}: {str(e)}")
                    await self.broadcast(symbol, {
                        "error": "Error updating stock data",
                        "timestamp": datetime.now().isoformat()
                    })
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
    """Validate if the stock symbol exists and is accessible"""
    try:
        stock = yf.Ticker(symbol)
        info = stock.info
        return bool(info.get('regularMarketPrice'))
    except Exception as e:
        logger.error(f"Error validating symbol {symbol}: {str(e)}")
        return False

# Define a function to fetch data from Yahoo Finance
def get_index_data(ticker: str) -> Dict:
    try:
        # Fetch data for the provided ticker symbol
        data = yf.Ticker(ticker)
        hist = data.history(period="1d")  # Fetch 1-day historical data
        
        if hist.empty:
            raise HTTPException(status_code=404, detail="Data not found")
        
        latest_data = hist.iloc[-1]
        
        return {
            "symbol": ticker,
            "date": latest_data.name.strftime("%Y-%m-%d %H:%M:%S"),
            "open": latest_data["Open"],
            "high": latest_data["High"],
            "low": latest_data["Low"],
            "close": latest_data["Close"],
            "volume": latest_data["Volume"],
        }
    except Exception as e:
        logger.error(f"Error fetching data for {ticker}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
    
@app4_router.websocket("/ws/{symbol}")
async def websocket_endpoint(websocket: WebSocket, symbol: str):
    if not validate_stock_symbol(symbol):
        await websocket.close(code=4004, reason=f"Invalid stock symbol: {symbol}")
        return
        
    await manager.connect(websocket, symbol)
    await manager.start_stock_updates(symbol)
    
    try:
        while True:
            try:
                # Keep the connection alive
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"Error in WebSocket connection for {symbol}: {str(e)}")
                break
    finally:
        manager.disconnect(websocket, symbol)

@app4_router.get("/")
async def root():
    return {"message": "Welcome to Stock Trading API"}

@app4_router.get("/stock/{symbol}", response_model=StockData)
async def get_stock_data(symbol: str):
    try:
        if not validate_stock_symbol(symbol):
            raise HTTPException(status_code=404, detail=f"Invalid or unavailable stock symbol: {symbol}")
        
        stock = yf.Ticker(symbol)
        info = stock.info
        
        current_price = info.get('regularMarketPrice', 0)
        previous_close = info.get('previousClose', 0)
        change = current_price - previous_close
        change_percent = (change / previous_close) * 100 if previous_close else 0
        
        return StockData(
            symbol=symbol,
            price=current_price,
            change=change,
            change_percent=change_percent,
            volume=info.get('regularMarketVolume', 0),
            timestamp=datetime.now()
        )
    except Exception as e:
        logger.error(f"Error fetching stock data for {symbol}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching data for {symbol}: {str(e)}")

@app4_router.get("/stock/{symbol}/technical", response_model=TechnicalIndicators)
async def get_technical_indicators(symbol: str):
    try:
        stock = yf.Ticker(symbol)
        hist = stock.history(period="1y")
        
        # Calculate RSI
        delta = hist['Close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        
        # Calculate MACD
        exp1 = hist['Close'].ewm(span=12, adjust=False).mean()
        exp2 = hist['Close'].ewm(span=26, adjust=False).mean()
        macd = exp1 - exp2
        signal = macd.ewm(span=9, adjust=False).mean()
        hist_macd = macd - signal
        
        # Calculate SMAs
        sma_20 = hist['Close'].rolling(window=20).mean()
        sma_50 = hist['Close'].rolling(window=50).mean()
        
        return TechnicalIndicators(
            symbol=symbol,
            rsi=float(rsi.iloc[-1]),
            macd=float(macd.iloc[-1]),
            macd_signal=float(signal.iloc[-1]),
            macd_hist=float(hist_macd.iloc[-1]),
            sma_20=float(sma_20.iloc[-1]),
            sma_50=float(sma_50.iloc[-1]),
            timestamp=datetime.now()
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Error calculating technical indicators for {symbol}: {str(e)}")

@app4_router.get("/stock/{symbol}/info", response_model=CompanyInfo)
async def get_company_info(symbol: str):
    try:
        stock = yf.Ticker(symbol)
        info = stock.info
        
        return CompanyInfo(
            symbol=symbol,
            name=info.get('longName', ''),
            sector=info.get('sector', ''),
            industry=info.get('industry', ''),
            market_cap=info.get('marketCap', 0),
            pe_ratio=info.get('forwardPE', 0),
            dividend_yield=info.get('dividendYield', 0) * 100 if info.get('dividendYield') else 0,
            beta=info.get('beta', 0),
            fifty_two_week_high=info.get('fiftyTwoWeekHigh', 0),
            fifty_two_week_low=info.get('fiftyTwoWeekLow', 0)
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Error fetching company info for {symbol}: {str(e)}")

@app4_router.get("/stock/{symbol}/history")
async def get_stock_history(symbol: str, timeframe: str = "1d"):
    try:
        if not validate_stock_symbol(symbol):
            raise HTTPException(status_code=404, detail=f"Invalid or unavailable stock symbol: {symbol}")
        
        stock = yf.Ticker(symbol)
        
        # Convert timeframe to yfinance period and interval
        period_map = {
            "1D": ("1d", "1m"),
            "1W": ("5d", "5m"),
            "1M": ("1mo", "1h"),
            "3M": ("3mo", "1d"),
            "1Y": ("1y", "1d")
        }
        
        period, interval = period_map.get(timeframe, ("1d", "1m"))
        history = stock.history(period=period, interval=interval)
        
        if history.empty:
            raise HTTPException(status_code=404, detail=f"No historical data available for {symbol}")
        
        history_list = []
        for index, row in history.iterrows():
            history_list.append({
                "timestamp": index.isoformat(),
                "price": float(row['Close']),
                "open": float(row['Open']),
                "high": float(row['High']),
                "low": float(row['Low']),
                "volume": int(row['Volume'])
            })
        
        return history_list
    except Exception as e:
        logger.error(f"Error fetching history for {symbol}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching history for {symbol}: {str(e)}")

@app4_router.get("/stock/{symbol}/news")
async def get_stock_news(symbol: str):
    try:
        if not validate_stock_symbol(symbol):
            raise HTTPException(status_code=404, detail=f"Invalid or unavailable stock symbol: {symbol}")
            
        stock = yf.Ticker(symbol)
        news = stock.news
        
        if not news:
            return []
            
        news_list = []
        for item in news:
            try:
                # Skip items with missing required fields
                if not all(key in item for key in ['title', 'summary', 'source', 'link']):
                    continue
                    
                # Skip items with empty required fields
                if not item['title'] or not item['summary'] or not item['source'] or not item['link']:
                    continue
                
                # Handle timestamp conversion safely
                publish_time = item.get('providerPublishTime', 0)
                if publish_time:
                    timestamp = datetime.fromtimestamp(publish_time)
                else:
                    timestamp = datetime.now()  # Fallback to current time if no timestamp
                
                news_item = {
                    "title": item['title'],
                    "summary": item['summary'],
                    "source": item['source'],
                    "published_at": timestamp.isoformat(),
                    "url": item['link']
                }
                
                # Only add valid news items
                if all(news_item.values()):
                    news_list.append(news_item)
                print(news_item)
            except (ValueError, TypeError) as e:
                logger.warning(f"Error processing news item: {str(e)}")
                continue
        
        # Sort news by published_at in descending order (newest first)
        news_list.sort(key=lambda x: x['published_at'], reverse=True)
        
        # Limit to 20 most recent news items
        return news_list[:20]
        
    except Exception as e:
        logger.error(f"Error fetching news for {symbol}: {str(e)}")
        raise HTTPException(status_code=404, detail=f"Error fetching news for {symbol}: {str(e)}")

@app4_router.get("/stock/{symbol}/major_holders")
async def get_major_holders(symbol: str):
    try:
        stock = yf.Ticker(symbol)
        major_holders = stock.major_holders
        
        if major_holders is None or major_holders.empty:
            return {"message": "No major holders data available"}
            
        holders_list = []
        for index, row in major_holders.iterrows():
            holders_list.append({
                "category": row[0],
                "percentage": row[1],
                "value": row[2]
            })
        
        return holders_list
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Error fetching major holders for {symbol}: {str(e)}")

@app4_router.get("/stock/{symbol}/earnings")
async def get_earnings(symbol: str):
    try:
        stock = yf.Ticker(symbol)
        earnings = stock.earnings
        
        if earnings is None or earnings.empty:
            return {"message": "No earnings data available"}
            
        earnings_list = []
        for index, row in earnings.iterrows():
            earnings_list.append({
                "date": index.isoformat(),
                "revenue": row['Revenue'],
                "earnings": row['Earnings'],
                "earnings_per_share": row['Earnings Per Share']
            })
        
        return earnings_list
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Error fetching earnings for {symbol}: {str(e)}")

@app4_router.get("/nifty50", response_model=Dict)
async def get_nifty50():
    ticker = "^NSEI"  # Ticker symbol for NIFTY 50
    return JSONResponse(content=get_index_data(ticker))

# Endpoint to fetch SENSEX data
@app4_router.get("/sensex", response_model=Dict)
async def get_sensex():
    ticker = "^BSESN"  # Ticker symbol for SENSEX
    return JSONResponse(content=get_index_data(ticker))

# Endpoint to fetch BANK NIFTY data
@app4_router.get("/banknifty", response_model=Dict)
async def get_banknifty():
    ticker = "^NSEBANK"  # Ticker symbol for BANK NIFTY
    return JSONResponse(content=get_index_data(ticker))


@app4_router.get("/search/{query}")
async def search_stocks(query: str):
    try:
        stock = yf.Ticker(query)
        info = stock.info
        
        return {
            "symbol": query,
            "name": info.get('longName', ''),
            "sector": info.get('sector', ''),
            "industry": info.get('industry', '')
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Error searching for {query}: {str(e)}")
