"""Simulation request models."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from backend.models.common import SYMBOL_PATTERN, SimulationStatus


# Simulation budgets are nominal paper allocations, not FX-converted holdings.
SIMULATION_CURRENCY = "INR"


class SimulationInput(BaseModel):
    currency: Literal["INR"] = SIMULATION_CURRENCY
    symbol: str = Field(pattern=SYMBOL_PATTERN)
    strategy: str = Field(min_length=1, max_length=60)
    startingCapital: float = Field(gt=0, allow_inf_nan=False, description="Paper capital in INR (Indian rupees)")
    notes: Optional[str] = Field(default=None, max_length=400)


class SimulationUpdate(BaseModel):
    status: Optional[SimulationStatus] = None
    notes: Optional[str] = Field(default=None, max_length=400)
