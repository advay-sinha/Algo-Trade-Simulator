# """
# Trading API Endpoints for Stock Data
# Extends your existing Trading.py to expose stock data endpoints for Botpress integration
# """
# from fastapi import APIRouter
# from typing import Dict, List, Optional, Any
# from pydantic import BaseModel
# from datetime import datetime
# import yfinance as yf
# from fastapi import HTTPException

# # Models for stock and market data
# class StockData(BaseModel):
#     symbol: str
#     price: float
#     change: float
#     percentage_change: float
#     timestamp: str
#     volume: Optional[int] = None
#     currency: str = "USD"

# class IndexData(BaseModel):
#     name: str
#     value: float
#     change: float
#     percentage_change: float

# class MarketSummary(BaseModel):
#     indices: List[IndexData]
#     timestamp: str

# # Create a router to organize endpoints specifically for Botpress integration
# trading_router = APIRouter(
#     prefix="/trading",
#     tags=["trading"],
#     responses={404: {"description": "Not found"}}
# )

# # Cache to reduce redundant API calls (very simple implementation)
# # In production, use a proper caching mechanism like Redis
# _stock_cache: Dict[str, Dict[str, Any]] = {}
# _market_cache: Dict[str, Any] = {}
# _cache_ttl = 60  # seconds

# def _cache_is_valid(cache_key: str, cache_dict: Dict[str, Any]) -> bool:
#     """Check if cached data is still valid based on TTL"""
#     if cache_key not in cache_dict:
#         return False
    
#     timestamp = cache_dict[cache_key].get("_timestamp", 0)
#     current_time = datetime.now().timestamp()
#     return (current_time - timestamp) < _cache_ttl

# @trading_router.get("/stock/{symbol}", response_model=StockData)
# async def get_stock_price(symbol: str):
#     """
#     Get current stock price and related information
    
#     Args:
#         symbol: Stock ticker symbol
        
#     Returns:
#         StockData object with current price information
    
#     Raises:
#         HTTPException: If stock data cannot be retrieved
#     """
#     symbol = symbol.upper()
    
#     # Check cache first
#     if _cache_is_valid(symbol, _stock_cache):
#         return _stock_cache[symbol]
    
#     try:
#         # Fetch data from Yahoo Finance
#         ticker = yf.Ticker(symbol)
        
#         # Get the latest price data
#         hist = ticker.history(period="2d")
        
#         if hist.empty:
#             raise HTTPException(status_code=404, detail=f"No data found for symbol {symbol}")
        
#         # Calculate values
#         current_price = hist['Close'].iloc[-1]
#         previous_close = hist['Close'].iloc[-2] if len(hist) > 1 else hist['Open'].iloc[-1]
#         price_change = current_price - previous_close
#         percentage_change = (price_change / previous_close * 100) if previous_close > 0 else 0
        
#         # Create response data
#         stock_data = {
#             "symbol": symbol,
#             "price": round(current_price, 2),
#             "change": round(price_change, 2),
#             "percentage_change": round(percentage_change, 2),
#             "volume": int(hist['Volume'].iloc[-1]) if 'Volume' in hist else None,
#             "currency": "USD",  # Default, could be fetched from ticker.info
#             "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
#             "_timestamp": datetime.now().timestamp()  # For cache validation
#         }
        
#         # Update cache
#         _stock_cache[symbol] = stock_data
        
#         return stock_data
    
#     except Exception as e:
#         if "not found" in str(e).lower():
#             raise HTTPException(status_code=404, detail=f"Symbol {symbol} not found")
#         raise HTTPException(status_code=500, detail=f"Error fetching stock data: {str(e)}")

# @trading_router.get("/market-summary", response_model=MarketSummary)
# async def get_market_summary():
#     """
#     Get summary of major market indices
    
#     Returns:
#         MarketSummary object with data for major indices
        
#     Raises:
#         HTTPException: If market data cannot be retrieved
#     """
#     cache_key = "market_summary"
    
#     # Check cache first
#     if _cache_is_valid(cache_key, _market_cache):
#         return _market_cache[cache_key]
    
#     try:
#         # Define major indices to track
#         indices = [
#             {"symbol": "^DJI", "name": "Dow Jones"},
#             {"symbol": "^GSPC", "name": "S&P 500"},
#             {"symbol": "^IXIC", "name": "NASDAQ"},
#             {"symbol": "^RUT", "name": "Russell 2000"}
#         ]
        
#         result_indices = []
        
#         # Fetch data for each index
#         for index in indices:
#             try:
#                 ticker = yf.Ticker(index["symbol"])
#                 hist = ticker.history(period="2d")
                
#                 if not hist.empty:
#                     current_value = hist['Close'].iloc[-1]
#                     previous_close = hist['Close'].iloc[-2] if len(hist) > 1 else hist['Open'].iloc[-1]
#                     value_change = current_value - previous_close
#                     percentage_change = (value_change / previous_close * 100) if previous_close > 0 else 0
                    
#                     result_indices.append({
#                         "name": index["name"],
#                         "value": round(current_value, 2),
#                         "change": round(value_change, 2),
#                         "percentage_change": round(percentage_change, 2)
#                     })
#             except Exception as e:
#                 # Log the error but continue with other indices
#                 print(f"Error fetching data for {index['name']}: {str(e)}")
        
#         # Create response
#         market_data = {
#             "indices": result_indices,
#             "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
#             "_timestamp": datetime.now().timestamp()  # For cache validation
#         }
        
#         # Update cache
#         _market_cache[cache_key] = market_data
        
#         return market_data
    
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Error fetching market summary: {str(e)}")