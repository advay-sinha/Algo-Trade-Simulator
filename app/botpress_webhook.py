# """
# Botpress Webhook Handler for Trading Data Integration
# Connects Botpress chatbot to your existing FastAPI trading endpoints
# """
# from fastapi import APIRouter, Request, HTTPException
# from typing import Dict, List, Optional, Any
# import httpx
# from pydantic import BaseModel

# # Create a router for the Botpress webhook endpoints
# botpress_router = APIRouter(
#     prefix="/botpress",
#     tags=["botpress"],
#     responses={404: {"description": "Not found"}},
# )

# # Models for the webhook request and response
# class Entity(BaseModel):
#     type: str
#     value: str
#     meta: Dict[str, float]

# class WebhookPayload(BaseModel):
#     text: Optional[str] = None
#     intentName: Optional[str] = None
#     entities: Optional[List[Entity]] = None
#     sessionId: str

# class WebhookRequest(BaseModel):
#     type: str
#     payload: WebhookPayload

# class MessageResponse(BaseModel):
#     type: str
#     text: str

# class WebhookResponse(BaseModel):
#     messages: List[MessageResponse]

# # Constants
# TRADING_BASE_URL = "http://localhost:8000"  # Base URL for your trading API

# # Helper functions
# async def fetch_stock_price(symbol: str) -> Dict[str, Any]:
#     """
#     Fetches stock price from your existing trading API
    
#     Args:
#         symbol: Stock ticker symbol
    
#     Returns:
#         Dictionary with stock data
#     """
#     async with httpx.AsyncClient() as client:
#         try:
#             # Adjust this endpoint to match your actual API
#             response = await client.get(f"{TRADING_BASE_URL}/trading/stock/{symbol}")
#             response.raise_for_status()
#             return response.json()
#         except httpx.HTTPError as e:
#             # Handle API errors
#             return {
#                 "symbol": symbol,
#                 "error": f"Error fetching stock data: {str(e)}",
#                 "price": None,
#                 "change": None,
#                 "percentage_change": None
#             }

# async def fetch_market_summary() -> Dict[str, Any]:
#     """
#     Fetches market summary from your existing trading API
    
#     Returns:
#         Dictionary with market summary data
#     """
#     async with httpx.AsyncClient() as client:
#         try:
#             # Adjust this endpoint to match your actual API
#             response = await client.get(f"{TRADING_BASE_URL}/trading/market-summary")
#             response.raise_for_status()
#             return response.json()
#         except httpx.HTTPError as e:
#             # Handle API errors
#             return {
#                 "error": f"Error fetching market summary: {str(e)}",
#                 "indices": []
#             }

# def format_stock_message(data: Dict[str, Any]) -> str:
#     """
#     Formats stock data into a readable message
    
#     Args:
#         data: Stock data from API
        
#     Returns:
#         Formatted message string
#     """
#     if data.get("error"):
#         return f"Sorry, I couldn't retrieve data for {data.get('symbol', 'the stock')}: {data['error']}"
    
#     # Handle potential missing fields with defaults
#     symbol = data.get("symbol", "Unknown")
#     price = data.get("price", 0)
#     change = data.get("change", 0)
#     percentage_change = data.get("percentage_change", 0)
    
#     direction = "up" if change >= 0 else "down"
#     change_sign = "+" if change >= 0 else ""
    
#     return (f"{symbol} is currently {price} USD ({direction} {change_sign}{change} / "
#             f"{change_sign}{percentage_change}%)\n"
#             f"Last updated: {data.get('timestamp', 'N/A')}")

# def format_market_summary(data: Dict[str, Any]) -> str:
#     """
#     Formats market summary into a readable message
    
#     Args:
#         data: Market summary data from API
        
#     Returns:
#         Formatted message string
#     """
#     if data.get("error"):
#         return f"Sorry, I couldn't retrieve the market summary: {data['error']}"
    
#     indices = data.get("indices", [])
#     if not indices:
#         return "Sorry, I couldn't retrieve the market summary at this time."
    
#     message = "Current Market Summary:\n\n"
    
#     for index in indices:
#         name = index.get("name", "Unknown")
#         value = index.get("value", 0)
#         change = index.get("change", 0)
#         percentage = index.get("percentage_change", 0)
        
#         direction = "up" if change >= 0 else "down"
#         change_sign = "+" if change >= 0 else ""
        
#         message += f"{name}: {value} ({direction} {change_sign}{change} / {change_sign}{percentage}%)\n"
    
#     message += f"\nLast updated: {data.get('timestamp', 'N/A')}"
    
#     return message

# # Primary webhook endpoint
# @botpress_router.post("/webhook", response_model=WebhookResponse)
# async def handle_botpress_webhook(request: WebhookRequest):
#     """
#     Handles incoming webhook requests from Botpress
    
#     Args:
#         request: Webhook request data from Botpress
        
#     Returns:
#         Webhook response for Botpress
#     """
#     # Default response
#     response_message = "I'm not sure how to help with stocks. Try asking for a specific stock symbol or the market summary."
    
#     # Extract intent and entities
#     intent_name = request.payload.intentName or ""
#     entities = request.payload.entities or []
#     text = request.payload.text or ""
    
#     # Find stock symbol entity if present
#     stock_entity = next((entity for entity in entities 
#                          if entity.type in ["stock_symbol", "ticker"]), None)
    
#     try:
#         # Process based on intent
#         if "stock_price" in intent_name or "get_stock" in intent_name:
#             if stock_entity:
#                 symbol = stock_entity.value
#                 stock_data = await fetch_stock_price(symbol)
#                 response_message = format_stock_message(stock_data)
#             else:
#                 response_message = "What stock symbol would you like to check?"
        
#         elif "market_summary" in intent_name or "market_overview" in intent_name:
#             market_data = await fetch_market_summary()
#             response_message = format_market_summary(market_data)
        
#         # Text fallback processing if no intent matching
#         elif text:
#             text_lower = text.lower()
            
#             # Check for stock price pattern: "price of AAPL" or "AAPL stock"
#             import re
#             stock_match = re.search(r'(?:price of|stock price for|how is|) ?([a-z]{1,5})(?:[ ]?stock|)', text_lower)
#             if stock_match and stock_match.group(1):
#                 symbol = stock_match.group(1).upper()
#                 stock_data = await fetch_stock_price(symbol)
#                 response_message = format_stock_message(stock_data)
            
#             # Check for market summary request
#             elif ("market" in text_lower and 
#                   any(keyword in text_lower for keyword in ["summary", "overview", "today"])):
#                 market_data = await fetch_market_summary()
#                 response_message = format_market_summary(market_data)
    
#     except Exception as e:
#         # Handle unexpected errors
#         response_message = f"I'm sorry, I encountered an error processing your request: {str(e)}"
    
#     # Return formatted response
#     return WebhookResponse(
#         messages=[MessageResponse(type="text", text=response_message)]
#     )