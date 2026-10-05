"""Bollinger-style mean reversion: buy stretched dips, exit when price returns toward the mean."""

from __future__ import annotations

import numpy as np
import pandas as pd
from pydantic import Field, model_validator

from backend.strategies.base import Strategy, StrategyParams, register


class MeanReversionParams(StrategyParams):
    lookback: int = Field(default=20, ge=5, le=250, title="Lookback (days)", description="Window for the mean and standard deviation.")
    entryZ: float = Field(default=2.0, ge=0.5, le=4.0, title="Entry z-score", description="Go long when price is this many standard deviations below the mean.")
    exitZ: float = Field(default=0.0, ge=-2.0, le=2.0, title="Exit z-score", description="Close the position once the z-score recovers to this level.")

    @model_validator(mode="after")
    def exit_above_entry(self) -> "MeanReversionParams":
        if self.exitZ <= -self.entryZ:
            raise ValueError("exitZ must be above -entryZ")
        return self


class MeanReversion(Strategy):
    id = "mean-reversion"
    name = "Mean reversion channel"
    description = "Long after price falls below the lower band; flat once it recovers toward the mean."
    params_model = MeanReversionParams
    data_requirements = "Daily closes of one symbol; one full lookback window for the mean and deviation."
    holding_horizon = "From a stretched dip until the price recovers toward its mean (typically days to weeks)."

    def min_history(self, params: MeanReversionParams) -> int:  # type: ignore[override]
        return params.lookback

    def generate_signals(self, bars: pd.DataFrame, params: MeanReversionParams) -> pd.Series:  # type: ignore[override]
        close = bars["close"]
        mean = close.rolling(params.lookback, min_periods=params.lookback).mean()
        std = close.rolling(params.lookback, min_periods=params.lookback).std(ddof=0)
        z = ((close - mean) / std.replace(0, np.nan)).to_numpy()
        # Stateful: hold from entry until the exit condition, using only data up to each bar.
        signal = np.zeros(len(close), dtype=int)
        holding = False
        for index, value in enumerate(z):
            if np.isnan(value):
                holding = False
            elif not holding and value < -params.entryZ:
                holding = True
            elif holding and value >= params.exitZ:
                holding = False
            signal[index] = 1 if holding else 0
        return pd.Series(signal, index=bars.index)


register(MeanReversion())
