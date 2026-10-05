"""Simulation request models."""

from __future__ import annotations

from typing import Dict, Literal, Optional, Union

from pydantic import BaseModel, Field

from backend.models.common import SYMBOL_PATTERN, SimulationStatus


# Simulation budgets are paper allocations in INR. Non-INR instruments are sized and marked
# through the daily exchange rate (see services/simulation_service.py).
SIMULATION_CURRENCY = "INR"


class SimulationInput(BaseModel):
    currency: Literal["INR"] = SIMULATION_CURRENCY
    symbol: str = Field(pattern=SYMBOL_PATTERN)
    strategy: str = Field(min_length=1, max_length=60, description="Strategy id from GET /api/backtest/strategies, e.g. 'sma-crossover'.")
    params: Dict[str, Union[int, float]] = Field(default_factory=dict, description="Strategy parameters; omitted ones use the strategy defaults.")
    startingCapital: float = Field(gt=0, le=1_000_000_000, allow_inf_nan=False, description="Paper capital in INR (Indian rupees)")
    costBps: float = Field(default=5, ge=0, le=500, description="Commission per fill, in basis points of notional.")
    slippageBps: float = Field(default=5, ge=0, le=500, description="Adverse fill-price slippage, in basis points.")
    benchmark: Optional[str] = Field(default=None, pattern=SYMBOL_PATTERN, description="Benchmark symbol; defaults to the listing market's index.")
    notes: Optional[str] = Field(default=None, max_length=400)


class SimulationUpdate(BaseModel):
    status: Optional[SimulationStatus] = None
    notes: Optional[str] = Field(default=None, max_length=400)
    # Only for simulations saved before strategies were tracked (state "needs_setup").
    strategy: Optional[str] = Field(default=None, min_length=1, max_length=60)
    params: Optional[Dict[str, Union[int, float]]] = None
