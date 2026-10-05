"""Time-series momentum: long while the trailing return over the lookback beats a threshold."""

from __future__ import annotations

import pandas as pd
from pydantic import Field

from backend.strategies.base import Strategy, StrategyParams, register


class MomentumParams(StrategyParams):
    lookback: int = Field(default=20, ge=2, le=250, title="Lookback (days)", description="Window for the trailing return.")
    threshold: float = Field(
        default=0.0,
        ge=-0.5,
        le=0.5,
        title="Entry threshold",
        description="Minimum trailing return (as a fraction, 0.02 = 2%) required to be long.",
    )


class Momentum(Strategy):
    id = "momentum"
    name = "Time-series momentum"
    description = "Absolute (time-series) momentum on one symbol: long while its own trailing return over the lookback window is above the threshold. It does not compare stocks with each other."
    params_model = MomentumParams
    data_requirements = "Daily closes of one symbol; lookback + 1 sessions."
    holding_horizon = "While the symbol's own trailing return stays above the threshold."

    def min_history(self, params: MomentumParams) -> int:  # type: ignore[override]
        return params.lookback + 1

    def generate_signals(self, bars: pd.DataFrame, params: MomentumParams) -> pd.Series:  # type: ignore[override]
        close = bars["close"]
        trailing = close / close.shift(params.lookback) - 1
        return (trailing > params.threshold).astype(int)


register(Momentum())
