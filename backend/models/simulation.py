"""Simulation request models."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from backend.models.common import SYMBOL_PATTERN, SimulationStatus


class SimulationInput(BaseModel):
    symbol: str = Field(pattern=SYMBOL_PATTERN)
    strategy: str = Field(min_length=1, max_length=60)
    startingCapital: float = Field(gt=0)
    notes: Optional[str] = Field(default=None, max_length=400)


class SimulationUpdate(BaseModel):
    status: Optional[SimulationStatus] = None
    notes: Optional[str] = Field(default=None, max_length=400)
