"""Request models for strategy-research runs (Phase 13)."""

from __future__ import annotations

from datetime import date
from typing import Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator

DATASET_PATTERN = r"^[0-9a-f]{64}$"
ParamValue = Union[int, float, str]


class RunSettings(BaseModel):
    """Everything that must be identical across runs being compared."""

    model_config = ConfigDict(extra="forbid")

    datasetVersion: str = Field(pattern=DATASET_PATTERN)
    start: Optional[date] = Field(default=None, description="First session that may trade (earlier data is warm-up only). Default: the snapshot start.")
    end: Optional[date] = Field(default=None, description="Last session. Default: the snapshot end.")
    capital: float = Field(default=1_000_000, ge=10_000, le=10_000_000_000, description="Starting capital in INR.")
    feeSchedule: Literal["nse-delivery", "flat-bps"] = "nse-delivery"
    brokerage: Literal["zero", "flat", "bps"] = "zero"
    brokerageFlatInr: float = Field(default=20.0, ge=0, le=1_000)
    brokerageBps: float = Field(default=0.0, ge=0, le=100)
    costBps: float = Field(default=5.0, ge=0, le=500, description="Only for the flat-bps schedule.")
    slippageBps: float = Field(default=5.0, ge=0, le=500)
    participationCap: float = Field(default=0.05, ge=0, le=1, description="Max share of trailing average daily volume per session; 0 = off.")
    minMedianTradedValueInr: float = Field(default=50_000_000, ge=0, le=1e12, description="Eligibility: median daily traded value over 63 sessions (default ₹5 crore).")
    priceFloor: float = Field(default=10.0, ge=0, le=100_000, description="Eligibility: minimum close in INR.")
    cashBuffer: float = Field(default=0.0, ge=0, lt=0.5)
    minTradeValue: float = Field(default=1_000.0, ge=0, le=10_000_000)
    riskFreeRate: float = Field(default=0.0, ge=0, le=0.2, description="Annual risk-free rate as a fraction, for Sharpe/Sortino.")

    @model_validator(mode="after")
    def ordered_dates(self) -> "RunSettings":
        if self.start and self.end and self.start >= self.end:
            raise ValueError("start must be before end")
        return self


class StrategySpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    strategy: str = Field(min_length=1, max_length=60)
    params: Dict[str, ParamValue] = Field(default_factory=dict)
    tolerance: Optional[float] = Field(default=None, ge=0, le=0.5, description="No-trade band on weight changes; default from the strategy.")
    label: Optional[str] = Field(default=None, max_length=60, pattern=r"^[A-Za-z0-9 .,:()+\-/%]*$")


class RunRequest(RunSettings, StrategySpec):
    model_config = ConfigDict(extra="forbid")


class CompareRequest(RunSettings):
    model_config = ConfigDict(extra="forbid")

    strategies: List[StrategySpec] = Field(min_length=1, max_length=6)
    costStress: float = Field(default=2.0, ge=1.0, le=5.0, description="Each strategy is also run with every cost multiplied by this factor.")
