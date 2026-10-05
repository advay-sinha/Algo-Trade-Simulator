"""Buy-and-hold baseline: long from the first executable bar to the end."""

from __future__ import annotations

import pandas as pd

from backend.strategies.base import Strategy, StrategyParams, register


class BuyAndHoldParams(StrategyParams):
    pass


class BuyAndHold(Strategy):
    id = "buy-and-hold"
    name = "Buy and hold"
    description = "Buy at the first opportunity and hold to the end — the baseline every strategy should beat."
    params_model = BuyAndHoldParams
    data_requirements = "Daily prices of one symbol."
    holding_horizon = "The whole window."
    risk_controls = ["None: fully invested from the first executable open."]

    def min_history(self, params: BuyAndHoldParams) -> int:  # type: ignore[override]
        return 1

    def generate_signals(self, bars: pd.DataFrame, params: BuyAndHoldParams) -> pd.Series:  # type: ignore[override]
        return pd.Series(1, index=bars.index, dtype=int)


register(BuyAndHold())
