"""Cross-sectional momentum: hold the stocks with the strongest past returns relative to the rest.

At each decision close, eligible stocks are ranked by their total return from `lookback` to
`skip` sessions ago (12-1 by default: the most recent month is skipped because short-term
returns tend to reverse). The top `holdings` are held, equally weighted (or inversely to their
volatility, as a separate configuration), subject to single-name and sector caps. A hold buffer
keeps an existing holding while its rank stays within holdings + buffer, which cuts turnover.
Parameters are research starting points, not tuned or proven settings.
"""

from __future__ import annotations

from typing import Dict, Literal

import numpy as np
from pydantic import Field, model_validator

from backend.research.snapshots import SnapshotView
from backend.services.portfolio_engine import Decision
from backend.strategies.base import StrategyParams
from backend.strategies.portfolio_base import DecisionContext, PortfolioStrategy, apply_caps, register_portfolio, trailing_return, trailing_volatility


class XsMomentumParams(StrategyParams):
    lookback: int = Field(default=252, ge=63, le=504, title="Lookback (sessions)", description="Start of the return window (252 ≈ 12 months).")
    skip: int = Field(default=21, ge=0, le=63, title="Skip (sessions)", description="Most recent sessions left out of the score (21 ≈ 1 month).")
    holdings: int = Field(default=10, ge=1, le=50, title="Holdings", description="Number of top-ranked stocks held.")
    holdBuffer: int = Field(default=0, ge=0, le=50, title="Hold buffer", description="Keep an existing holding while its rank is within holdings + buffer.")
    weighting: Literal["equal", "inverse_vol"] = Field(default="equal", title="Weighting", description="Equal weights, or weights inversely proportional to trailing volatility.")
    volWindow: int = Field(default=63, ge=20, le=252, title="Volatility window (sessions)", description="Window for inverse-volatility weights.")
    maxWeight: float = Field(default=0.2, gt=0, le=1, title="Max weight per stock", description="Single-name cap as a fraction of equity.")
    sectorCap: float = Field(default=0.4, gt=0, le=1, title="Max weight per sector", description="Sector cap as a fraction of equity (current classification).")
    rebalance: Literal["monthly", "weekly"] = Field(default="monthly", title="Rebalance", description="Decision at the last session of each month (or week).")

    @model_validator(mode="after")
    def skip_inside_lookback(self) -> "XsMomentumParams":
        if self.skip >= self.lookback:
            raise ValueError("skip must be shorter than lookback")
        return self


class XsMomentum(PortfolioStrategy):
    id = "xs-momentum"
    name = "Cross-sectional momentum"
    description = "Ranks eligible stocks by their past return relative to each other (12 months excluding the latest month by default) and holds the strongest, long only."
    params_model = XsMomentumParams
    data_requirements = "Daily dividend-adjusted closes and volume for the whole universe; lookback + 1 sessions per stock."
    holding_horizon = "One rebalance period at a time (monthly by default); names stay while they rank in the top group."
    risk_controls = ["Long only, fully invested at most 100%.", "Single-name cap.", "Sector cap (current classification).", "Liquidity and history eligibility filters.", "Optional hold buffer to limit turnover."]
    caveats = ["Momentum portfolios can suffer sharp reversals (momentum crashes).", "Parameters are research starting points, not optimised settings."]

    def warmup_sessions(self, params: XsMomentumParams) -> int:  # type: ignore[override]
        return params.lookback + 1

    def rebalance(self, params: XsMomentumParams) -> str:  # type: ignore[override]
        return params.rebalance

    def decide(self, view: SnapshotView, context: DecisionContext, params: XsMomentumParams) -> Decision:  # type: ignore[override]
        t = view.end
        adj = view.field("adj_close")
        symbols = view.symbols
        score = trailing_return(adj, t, params.lookback, params.skip)
        ok = context.eligible & np.isfinite(score)
        candidates = [j for j in range(len(symbols)) if ok[j]]
        # Rank: highest score first, ties broken by symbol for determinism.
        ranked = sorted(candidates, key=lambda j: (-score[j], symbols[j]))
        rank = {symbols[j]: position + 1 for position, j in enumerate(ranked)}
        total = len(ranked)
        previous = {symbol for symbol, weight in (context.previous.weights.items() if context.previous else []) if weight > 0}
        selected = [symbols[j] for j in ranked[: params.holdings]]
        reasons: Dict[str, str] = {}
        if params.holdBuffer and previous:
            keep = [symbol for symbol in previous if symbol in rank and rank[symbol] <= params.holdings + params.holdBuffer and symbol not in selected]
            # Incumbents within the buffer stay; they displace the lowest-ranked newcomers.
            newcomers = [symbol for symbol in selected if symbol not in previous]
            while keep and newcomers and len(selected) >= params.holdings:
                dropped = newcomers.pop()
                selected.remove(dropped)
                incumbent = min(keep, key=lambda symbol: rank[symbol])
                keep.remove(incumbent)
                selected.append(incumbent)
        index = {symbol: j for j, symbol in enumerate(symbols)}
        if not selected:
            return Decision(weights={}, reasons={symbol: "No eligible stock had a full lookback history." for symbol in previous})
        if params.weighting == "inverse_vol":
            vol = trailing_volatility(adj, t, params.volWindow)
            inverse = {symbol: 1 / vol[index[symbol]] for symbol in selected if np.isfinite(vol[index[symbol]]) and vol[index[symbol]] > 0}
            norm = sum(inverse.values())
            raw = {symbol: value / norm for symbol, value in inverse.items()} if norm > 0 else {symbol: 1 / len(selected) for symbol in selected}
        else:
            raw = {symbol: 1 / len(selected) for symbol in selected}
        weights = apply_caps(raw, context.sectors, params.maxWeight, params.sectorCap)
        day = view.dates[-1].isoformat()
        for symbol in selected:
            in_top = rank[symbol] <= params.holdings
            reasons[symbol] = (
                f"Rank {rank[symbol]} of {total} by momentum: return from {params.lookback} to {params.skip} sessions before the {day} close was {score[index[symbol]]:+.1%}."
                if in_top
                else f"Kept: rank {rank[symbol]} of {total}, inside the hold buffer (top {params.holdings + params.holdBuffer}) at the {day} close."
            )
        for symbol in previous - set(selected):
            if symbol in rank:
                reasons[symbol] = f"Fell to rank {rank[symbol]} of {total} at the {day} close (needs top {params.holdings + params.holdBuffer if params.holdBuffer else params.holdings})."
            else:
                reasons[symbol] = f"No longer eligible at the {day} close (liquidity, history or no trade that session)."
        return Decision(weights=weights, reasons=reasons)


register_portfolio(XsMomentum())
