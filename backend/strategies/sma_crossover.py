"""Simple moving-average crossover: long while the short average is above the long one."""

from __future__ import annotations

import pandas as pd
from pydantic import Field, model_validator

from backend.strategies.base import Strategy, StrategyParams, register


class SmaCrossoverParams(StrategyParams):
    shortWindow: int = Field(default=20, ge=2, le=200, title="Short window (days)", description="Fast moving-average length.")
    longWindow: int = Field(default=60, ge=3, le=400, title="Long window (days)", description="Slow moving-average length.")

    @model_validator(mode="after")
    def short_below_long(self) -> "SmaCrossoverParams":
        if self.shortWindow >= self.longWindow:
            raise ValueError("shortWindow must be less than longWindow")
        return self


class SmaCrossover(Strategy):
    id = "sma-crossover"
    name = "Simple moving average crossover"
    description = "Long while the short moving average is above the long one; flat otherwise."
    params_model = SmaCrossoverParams

    def min_history(self, params: SmaCrossoverParams) -> int:  # type: ignore[override]
        return params.longWindow

    def generate_signals(self, bars: pd.DataFrame, params: SmaCrossoverParams) -> pd.Series:  # type: ignore[override]
        close = bars["close"]
        short = close.rolling(params.shortWindow, min_periods=params.shortWindow).mean()
        long = close.rolling(params.longWindow, min_periods=params.longWindow).mean()
        # NaN during warm-up compares False -> flat.
        return (short > long).astype(int)


register(SmaCrossover())
