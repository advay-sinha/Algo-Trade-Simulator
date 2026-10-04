"""Request models for the backtesting API."""

from __future__ import annotations

from typing import Dict, Literal, Optional, Union

from pydantic import BaseModel, Field

from backend.models.common import SYMBOL_PATTERN

BacktestRange = Literal["6mo", "1y", "2y", "5y"]


class BacktestRequest(BaseModel):
    symbol: str = Field(pattern=SYMBOL_PATTERN)
    strategy: str = Field(min_length=1, max_length=60)
    params: Dict[str, Union[int, float]] = Field(default_factory=dict)
    range: BacktestRange = "1y"
    startingCapital: float = Field(default=100_000, gt=0, le=1_000_000_000)
    costBps: float = Field(default=5, ge=0, le=500, description="Commission per fill, in basis points of notional.")
    slippageBps: float = Field(default=5, ge=0, le=500, description="Adverse fill-price slippage, in basis points.")
    benchmark: Optional[str] = Field(default=None, pattern=SYMBOL_PATTERN, description="Benchmark symbol; defaults to the listing market's index.")
    riskFreeRate: float = Field(default=0.0, ge=0, le=0.2, description="Annual risk-free rate as a fraction (0.04 = 4%).")
