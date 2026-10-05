"""Equal-weight universe baseline: every eligible stock at the same weight, rebalanced monthly.

The yardstick for universe strategies: it owns the same stocks under the same costs and
eligibility rules, so any difference comes from the strategy's selection and sizing.
"""

from __future__ import annotations

from typing import Literal

import numpy as np
from pydantic import Field

from backend.research.snapshots import SnapshotView
from backend.services.portfolio_engine import Decision
from backend.strategies.base import StrategyParams
from backend.strategies.portfolio_base import DecisionContext, PortfolioStrategy, register_portfolio


class EqualWeightParams(StrategyParams):
    rebalance: Literal["monthly", "weekly"] = Field(default="monthly", title="Rebalance", description="Back to equal weights at the last session of each month (or week).")


class EqualWeightUniverse(PortfolioStrategy):
    id = "equal-weight-universe"
    name = "Equal-weight universe"
    description = "Holds every eligible stock in the universe at the same weight; the baseline for universe strategies."
    params_model = EqualWeightParams
    data_requirements = "Daily closes and volume for the universe (eligibility only)."
    holding_horizon = "Always invested; weights reset at each rebalance."
    risk_controls = ["Long only, fully invested.", "Same eligibility filters as the strategies it is compared with."]
    maturity = "baseline"

    def warmup_sessions(self, params: EqualWeightParams) -> int:  # type: ignore[override]
        return 1

    def rebalance(self, params: EqualWeightParams) -> str:  # type: ignore[override]
        return params.rebalance

    def decide(self, view: SnapshotView, context: DecisionContext, params: EqualWeightParams) -> Decision:  # type: ignore[override]
        chosen = [view.symbols[j] for j in np.flatnonzero(context.eligible)]
        day = view.dates[-1].isoformat()
        if not chosen:
            return Decision(weights={})
        weight = 1 / len(chosen)
        return Decision(weights={symbol: weight for symbol in chosen}, reasons={symbol: f"Equal weight across {len(chosen)} eligible stocks at the {day} close." for symbol in chosen})


register_portfolio(EqualWeightUniverse())
