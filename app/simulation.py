from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter
import asyncio
import json
import random

from yahoo_service import (
    YahooFinanceError,
    get_bulk_price_snapshots,
    get_price_history,
    search_symbol,
)

app5_router = APIRouter()

# In-memory storage (would use a database in production)
ACCOUNT = {
    "id": 1,
    "name": "Simulation Account",
    "balance": 1000000,
    "currency": "INR",
}

PORTFOLIO: List[Dict] = []
TRADES: List[Dict] = []
STOCKS_CACHE: List[Dict] = []
STOCKS_CACHE_TIME = None

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[WebSocket, List[str]] = {}
        self.stock_update_task = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[websocket] = []  # Initialize with empty subscriptions
        
        # Start the background task if this is the first connection
        if self.stock_update_task is None or self.stock_update_task.done():
            self.stock_update_task = asyncio.create_task(self.broadcast_stock_updates())

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            del self.active_connections[websocket]

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in list(self.active_connections.keys()):
            try:
                await connection.send_text(message)
            except:
                # Connection might be closed
                await self.disconnect(connection)

    async def subscribe(self, websocket: WebSocket, symbols: List[str]):
        if websocket in self.active_connections:
            # Add to user's subscriptions
            self.active_connections[websocket] = list(set(self.active_connections[websocket] + symbols))
            return True
        return False

    async def broadcast_stock_updates(self):
        """Background task to simulate and broadcast stock updates"""
        while True:
            if not self.active_connections:
                await asyncio.sleep(5)
                continue
                
            # Collect all subscribed symbols
            all_symbols = set()
            for symbols in self.active_connections.values():
                all_symbols.update(symbols)
                
            if not all_symbols and STOCKS_CACHE:
                # If no specific subscriptions but we have cached data, use those symbols
                all_symbols = {stock["symbol"] for stock in STOCKS_CACHE}
                
            # If we still don't have symbols, use defaults
            if not all_symbols:
                all_symbols = {"RELIANCE", "TCS", "HDFCBANK", "INFY", "BHARTIARTL"}
            
            # Get the latest data for these symbols from cache or fetch new
            for symbol in all_symbols:
                try:
                    # Find stock in cache
                    stock_data = next((s for s in STOCKS_CACHE if s["symbol"] == symbol), None)
                    
                    if not stock_data:
                        continue
                        
                    # Generate simulated price movement
                    current_price = stock_data["currentPrice"]
                    price_change = round(current_price * random.uniform(-0.005, 0.005), 2)
                    new_price = round(current_price + price_change, 2)
                    
                    # Calculate daily change based on new price
                    daily_change = round(stock_data["change"] + price_change, 2)
                    daily_change_percent = round((daily_change / (new_price - daily_change)) * 100, 2)
                    
                    # Create the update message
                    update = {
                        "type": "stockUpdate",
                        "symbol": symbol,
                        "price": new_price,
                        "change": daily_change,
                        "changePercent": daily_change_percent,
                        "volume": random.randint(1000, 10000),
                        "timestamp": datetime.now().isoformat()
                    }
                    
                    # Update the cache with new price
                    stock_data["currentPrice"] = new_price
                    stock_data["change"] = daily_change
                    stock_data["changePercent"] = daily_change_percent
                    
                    # Broadcast to all connected clients
                    for connection, subscribed_symbols in list(self.active_connections.items()):
                        if not subscribed_symbols or symbol in subscribed_symbols:
                            try:
                                await connection.send_json(update)
                            except:
                                # Connection might be closed
                                try:
                                    self.disconnect(connection)
                                except:
                                    pass
                                
                except Exception as e:
                    print(f"Error updating stock {symbol}: {e}")
                    
                # Small delay between symbol updates
                await asyncio.sleep(0.2)
                
            # Wait before next update cycle
            await asyncio.sleep(5)

# Initialize connection manager
manager = ConnectionManager()

class Trade(BaseModel):
    stockId: str
    stockSymbol: str
    stockName: str
    quantity: int
    price: float
    type: str  # "buy" or "sell"
    timestamp: str

class StockData(BaseModel):
    id: str
    symbol: str
    name: str
    currentPrice: float
    change: float
    changePercent: float

class SubscriptionRequest(BaseModel):
    type: str  # "subscribe"
    symbols: List[str]

# WebSocket endpoint
@app5_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get("type") == "subscribe" and "symbols" in message:
                    symbols = message["symbols"]
                    await manager.subscribe(websocket, symbols)
                    # Send confirmation
                    await websocket.send_json({
                        "type": "subscriptionConfirmed",
                        "symbols": symbols
                    })
            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "error",
                    "message": "Invalid JSON format"
                })
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Helper function to fetch stock data from yfinance
def fetch_stock_data(symbols):
    stock_data = []

    if not symbols:
        symbols = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "BHARTIARTL.NS"]

    formatted_symbols = [s if s.endswith(".NS") else f"{s}.NS" for s in symbols]

    try:
        snapshots = get_bulk_price_snapshots(formatted_symbols)
    except YahooFinanceError as exc:
        print(f"Error fetching stock data: {exc}")
        return stock_data

    for snapshot in snapshots:
        plain_symbol = snapshot.symbol.replace(".NS", "")
        try:
            profile = search_symbol(snapshot.symbol)
            company_name = profile.get("name", plain_symbol)
        except YahooFinanceError:
            company_name = plain_symbol

        stock_data.append({
            "id": plain_symbol,
            "symbol": plain_symbol,
            "name": company_name,
            "currentPrice": round(snapshot.price, 2),
            "change": round(snapshot.change, 2),
            "changePercent": round(snapshot.change_percent, 2),
        })

    return stock_data

# GET /account
@app5_router.get("/account")
async def get_account():
    return ACCOUNT

# GET /stocks
@app5_router.get("/stocks")
async def get_stocks():
    global STOCKS_CACHE, STOCKS_CACHE_TIME
    
    # Check if we need to refresh the cache (every 30 seconds)
    current_time = datetime.now()
    if STOCKS_CACHE_TIME is None or (current_time - STOCKS_CACHE_TIME) > timedelta(seconds=30):
        STOCKS_CACHE = fetch_stock_data([])
        STOCKS_CACHE_TIME = current_time
        
    return STOCKS_CACHE

# GET /portfolio
@app5_router.get("/portfolio")
async def get_portfolio():
    return PORTFOLIO

# DELETE /portfolio/{position_id}
@app5_router.delete("/portfolio/{position_id}")
async def delete_position(position_id: int):
    # Find the position
    position = next((p for p in PORTFOLIO if p["id"] == position_id), None)
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")
    
    # Get current stock price from cache
    stock_data = next((s for s in STOCKS_CACHE if s["symbol"] == position["stockSymbol"]), None)
    current_price = stock_data["currentPrice"] if stock_data else position["averagePrice"]
    
    # Create a sell trade to close the position
    trade = {
        "id": str(uuid.uuid4()),
        "stockSymbol": position["stockSymbol"],
        "stockName": position["stockName"],
        "quantity": position["quantity"],
        "price": current_price,
        "type": "sell",
        "timestamp": datetime.now().isoformat()
    }
    
    # Update account balance
    sell_value = trade["price"] * position["quantity"]
    ACCOUNT["balance"] += sell_value
    
    # Add the trade to history
    TRADES.append(trade)
    
    # Remove the position from portfolio
    PORTFOLIO.remove(position)
    
    return {"success": True}

# GET /trades
@app5_router.get("/trades")
async def get_trades():
    return TRADES

# POST /trades
@app5_router.post("/trades")
async def create_trade(trade: Trade):
    global PORTFOLIO
    
    # Validate trade data
    if trade.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")
    
    # Calculate trade value
    trade_value = trade.price * trade.quantity
    
    # Process buy order
    if trade.type == "buy":
        # Check if enough balance
        if ACCOUNT["balance"] < trade_value:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        
        # Update account balance
        ACCOUNT["balance"] -= trade_value
        
        # Update portfolio
        existing_position = next(
            (p for p in PORTFOLIO if p["stockId"] == trade.stockId), None
        )
        
        if existing_position:
            # Update existing position
            total_shares = existing_position["quantity"] + trade.quantity
            total_value = (
                existing_position["quantity"] * existing_position["averagePrice"] + 
                trade.quantity * trade.price
            )
            existing_position["quantity"] = total_shares
            existing_position["averagePrice"] = round(total_value / total_shares, 2)
        else:
            # Create new position
            PORTFOLIO.append({
                "id": len(PORTFOLIO) + 1,
                "stockId": trade.stockId,
                "stockSymbol": trade.stockSymbol,
                "stockName": trade.stockName,
                "quantity": trade.quantity,
                "averagePrice": trade.price
            })
    
    # Process sell order
    elif trade.type == "sell":
        # Find position in portfolio
        existing_position = next(
            (p for p in PORTFOLIO if p["stockId"] == trade.stockId), None
        )
        
        if not existing_position:
            raise HTTPException(status_code=400, detail="Stock not in portfolio")
            
        if existing_position["quantity"] < trade.quantity:
            raise HTTPException(status_code=400, detail="Not enough shares")
        
        # Update account balance
        ACCOUNT["balance"] += trade_value
        
        # Update portfolio
        if existing_position["quantity"] == trade.quantity:
            # Remove position if selling all shares
            PORTFOLIO = [p for p in PORTFOLIO if p["stockId"] != trade.stockId]
        else:
            # Update position if selling some shares
            existing_position["quantity"] -= trade.quantity
    
    else:
        raise HTTPException(status_code=400, detail="Invalid trade type")
    
    # Add trade to history
    new_trade = {
        "id": str(uuid.uuid4()),
        "stockSymbol": trade.stockSymbol,
        "stockName": trade.stockName,
        "quantity": trade.quantity,
        "price": trade.price,
        "type": trade.type,
        "timestamp": trade.timestamp
    }
    TRADES.append(new_trade)
    
    return new_trade

# Helper endpoint to get historical data for a stock
@app5_router.get("/stock/{symbol}/history")
async def get_stock_history(symbol: str, period: str = "1d", interval: str = "1m"):
    try:
        # Add .NS suffix for NSE stocks if not present
        if not symbol.endswith(".NS"):
            symbol = f"{symbol}.NS"
            
        history = get_price_history(symbol, period=period, interval=interval)

        formatted_data = []
        for entry in history:
            timestamp = datetime.fromisoformat(entry["timestamp"])
            formatted_data.append({
                "time": timestamp.strftime("%H:%M"),
                "price": round(entry["price"], 2),
                "open": round(entry["open"], 2),
                "high": round(entry["high"], 2),
                "low": round(entry["low"], 2),
                "volume": int(entry["volume"])
            })

        return formatted_data

    except YahooFinanceError as exc:
        raise HTTPException(status_code=500, detail=f"Error fetching data: {str(exc)}")

# Root endpoint
@app5_router.get("/")
async def root():
    return {"message": "Trading Simulation API"}

# Function to integrate this router with the main FastAPI app
def setup_trading_app(app: FastAPI):
    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # In production, specify actual origins
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Include the router
    app.include_router(app5_router, prefix="/api/trading")
    
    return app