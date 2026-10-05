"""ML ranking portfolio: hold the stocks a walk-forward ranking model scored highest.

The scores come from a stored ranking experiment (Phase 13d): for each decision date, the
prediction of the model that was trainable at that date (never the final model applied
backwards). Dates without a stored prediction hold no new targets (the run stays in cash until
the first one). Same caps, cash and liquidity rules as every other universe strategy.
"""

from __future__ import annotations

from typing import Dict, List, Literal, Tuple

import numpy as np
from pydantic import Field

from backend.research.snapshots import SnapshotView
from backend.services.portfolio_engine import Decision
from backend.strategies.base import StrategyParams
from backend.strategies.portfolio_base import DecisionContext, PortfolioStrategy, apply_caps, register_portfolio


class MlRankingParams(StrategyParams):
    model: str = Field(default="", pattern=r"^([0-9a-f]{32})?$", title="Ranking experiment", description="Id of a stored ranking experiment.")
    family: Literal["hgb", "ridge"] = Field(default="hgb", title="Model", description="Boosted trees or the linear benchmark from that experiment.")
    holdings: int = Field(default=10, ge=1, le=50, title="Holdings", description="Number of top-scored stocks held.")
    holdBuffer: int = Field(default=5, ge=0, le=50, title="Hold buffer", description="Keep an existing holding while its rank is within holdings + buffer.")
    maxWeight: float = Field(default=0.2, gt=0, le=1, title="Max weight per stock")
    sectorCap: float = Field(default=0.4, gt=0, le=1, title="Max weight per sector")


class MlRanking(PortfolioStrategy):
    id = "ml-ranking"
    name = "ML stock ranking"
    description = "Holds the stocks a walk-forward ranking model scored highest for the next 20 sessions' return relative to the universe, equally weighted."
    params_model = MlRankingParams
    data_requirements = "A stored ranking experiment on the same dataset (its walk-forward predictions)."
    holding_horizon = "One month; names stay while they rank within the top group plus the buffer."
    risk_controls = ["Long only, at most 100% invested.", "Single-name and sector caps.", "Hold buffer to limit turnover.", "Each date uses only the model trainable on that date."]
    caveats = ["Forecast quality does not establish net trading profitability.", "Model results are experimental unless the experiment passed its prespecified criteria."]

    def warmup_sessions(self, params: MlRankingParams) -> int:  # type: ignore[override]
        return 1

    def rebalance(self, params: MlRankingParams) -> str:  # type: ignore[override]
        return "monthly"

    def decide(self, view: SnapshotView, context: DecisionContext, params: MlRankingParams) -> Decision:  # type: ignore[override]
        day = view.dates[-1].isoformat()
        predictions: Dict[str, List[Tuple[str, float]]] = context.extra.get("predictions", {})
        scored = predictions.get(day)
        previous = {symbol for symbol, weight in (context.previous.weights.items() if context.previous else []) if weight > 0}
        if scored is None:
            return context.previous or Decision(weights={})
        eligible = {view.symbols[j] for j in np.flatnonzero(context.eligible)}
        ranked = [symbol for symbol, _ in sorted(((s, v) for s, v in scored if s in eligible), key=lambda item: (-item[1], item[0]))]
        rank = {symbol: position + 1 for position, symbol in enumerate(ranked)}
        score = dict(scored)
        selected = ranked[: params.holdings]
        if params.holdBuffer and previous:
            keep = [s for s in previous if s in rank and rank[s] <= params.holdings + params.holdBuffer and s not in selected]
            newcomers = [s for s in selected if s not in previous]
            while keep and newcomers:
                selected.remove(newcomers.pop())
                incumbent = min(keep, key=lambda s: rank[s])
                keep.remove(incumbent)
                selected.append(incumbent)
        if not selected:
            return Decision(weights={}, reasons={s: f"No eligible stock had a model score at the {day} close." for s in previous})
        weights = apply_caps({s: 1 / len(selected) for s in selected}, context.sectors, params.maxWeight, params.sectorCap)
        reasons = {
            s: (f"Model rank {rank[s]} of {len(ranked)} (score {score[s]:+.4f}) at the {day} close." if rank[s] <= params.holdings else f"Kept: model rank {rank[s]} of {len(ranked)}, inside the hold buffer at the {day} close.")
            for s in selected
        }
        for s in previous - set(selected):
            reasons[s] = f"Model rank fell to {rank[s]} of {len(ranked)} at the {day} close." if s in rank else f"No longer eligible or unscored at the {day} close."
        return Decision(weights=weights, reasons=reasons)


register_portfolio(MlRanking())
