"""Static catalogs shared by routes."""

from typing import Any, Dict, List

WATCHLIST_SYMBOLS = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA"]
DEFAULT_STRATEGIES: List[Dict[str, Any]] = [
    {
        "id": "sma-crossover",
        "name": "Simple moving average crossover",
        "description": "Classic two-line crossover highlighting short vs long momentum shifts.",
        "recommendedFor": ["momentum", "swing"],
        "parameters": [
            {"name": "shortWindow", "value": "20"},
            {"name": "longWindow", "value": "60"},
        ],
    },
    {
        "id": "mean-reversion",
        "name": "Mean reversion channel",
        "description": "Pairs Bollinger style envelopes with RSI to fade stretched moves.",
        "recommendedFor": ["range-bound", "volatility"],
        "parameters": [
            {"name": "lookback", "value": "14"},
            {"name": "deviation", "value": "2"},
        ],
    },
    {
        "id": "momentum",
        "name": "Time-series momentum",
        "description": "Stay long while the trailing return over a lookback window is positive.",
        "recommendedFor": ["trend", "momentum"],
        "parameters": [
            {"name": "lookback", "value": "20"},
            {"name": "threshold", "value": "0"},
        ],
    },
    {
        "id": "trend-follow",
        "name": "Trend following breakout",
        "description": "Capture breakouts by combining Donchian channels with ATR filters.",
        "recommendedFor": ["breakout", "trend"],
        "parameters": [
            {"name": "channel", "value": "20"},
            {"name": "atr", "value": "14"},
        ],
    },
]
