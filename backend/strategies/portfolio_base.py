"""Universe (portfolio) strategies for the Phase 13 research engine.

A portfolio strategy turns everything known at a decision close into target weights. It never
computes returns or fills: the engine (services/portfolio_engine.py) does that for every
strategy the same way. It receives a SnapshotView that ends at the decision session, the
eligibility mask for that session, the previous decision (for hold buffers) and static context
(sector map) — nothing from later sessions.

This registry is separate from the single-asset REGISTRY in base.py so existing backtests,
simulations and their golden baselines are unaffected.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, ClassVar, Dict, List, Mapping, Optional, Type

import numpy as np

from backend.research.snapshots import SnapshotView
from backend.services.portfolio_engine import Decision
from backend.strategies.base import StrategyParams, describe_params


@dataclass(frozen=True)
class DecisionContext:
    eligible: np.ndarray  # bool per snapshot symbol, from data up to the decision close
    previous: Optional[Decision]  # the strategy's own previous decision (or None)
    sectors: Mapping[str, str] = field(default_factory=dict)
    extra: Mapping[str, Any] = field(default_factory=dict)  # run-scoped inputs, e.g. stored model predictions


class PortfolioStrategy(ABC):
    id: ClassVar[str]
    name: ClassVar[str]
    description: ClassVar[str]
    params_model: ClassVar[Type[StrategyParams]]
    data_requirements: ClassVar[str]
    holding_horizon: ClassVar[str]
    risk_controls: ClassVar[List[str]]
    maturity: ClassVar[str] = "research"
    default_tolerance: ClassVar[float] = 0.0
    caveats: ClassVar[List[str]] = []

    def parse_params(self, raw: Dict[str, Any]) -> StrategyParams:
        return self.params_model(**raw)

    @abstractmethod
    def warmup_sessions(self, params: StrategyParams) -> int:
        """Sessions of history a symbol needs before it can be scored."""

    @abstractmethod
    def rebalance(self, params: StrategyParams) -> str:
        """'monthly' | 'weekly' | 'daily'."""

    @abstractmethod
    def decide(self, view: SnapshotView, context: DecisionContext, params: StrategyParams) -> Decision:
        """Target weights from data up to view.end only."""

    def describe(self) -> Dict[str, Any]:
        defaults = self.params_model()
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "parameters": describe_params(self.params_model),
            "metadata": {
                "executionMode": "universe",
                "dataRequirements": self.data_requirements,
                "warmupSessions": self.warmup_sessions(defaults),
                "rebalance": self.rebalance(defaults),
                "holdingHorizon": self.holding_horizon,
                "riskControls": list(self.risk_controls),
                "maturity": self.maturity,
                "defaultTolerance": self.default_tolerance,
                "caveats": list(self.caveats),
            },
        }


PORTFOLIO_REGISTRY: Dict[str, PortfolioStrategy] = {}


def register_portfolio(strategy: PortfolioStrategy) -> PortfolioStrategy:
    PORTFOLIO_REGISTRY[strategy.id] = strategy
    return strategy


# ---------------------------------------------------------------------------------------------
# Shared helpers (pure, data up to t only)


def trailing_return(adj: np.ndarray, t: int, lookback: int, skip: int = 0) -> np.ndarray:
    """Return from session t-lookback to t-skip per symbol; NaN where either price is missing."""
    if t - lookback < 0:
        return np.full(adj.shape[1], np.nan)
    with np.errstate(divide="ignore", invalid="ignore"):
        return adj[t - skip] / adj[t - lookback] - 1


def trailing_volatility(adj: np.ndarray, t: int, window: int) -> np.ndarray:
    """Annualised std of daily adjusted returns over the last `window` sessions ending at t."""
    start = max(0, t - window)
    block = adj[start : t + 1]
    with np.errstate(divide="ignore", invalid="ignore"):
        returns = block[1:] / block[:-1] - 1
    valid = np.isfinite(returns)
    count = valid.sum(axis=0)
    filled = np.where(valid, returns, 0.0)
    mean = np.divide(filled.sum(axis=0), count, out=np.full(adj.shape[1], np.nan), where=count > 0)
    sq = np.where(valid, (returns - mean) ** 2, 0.0).sum(axis=0)
    var = np.divide(sq, count - 1, out=np.full(adj.shape[1], np.nan), where=count > 1)
    vol = np.sqrt(var) * np.sqrt(252)
    vol[count < max(2, window // 2)] = np.nan  # too little data to estimate
    return vol


def apply_caps(weights: Dict[str, float], sectors: Mapping[str, str], max_weight: float, sector_cap: float) -> Dict[str, float]:
    """Cap single names and sectors; excess goes pro rata to names with room, else stays in cash."""
    w = {symbol: value for symbol, value in weights.items() if value > 0}
    for _ in range(50):
        changed = False
        excess = 0.0
        for symbol in w:
            if w[symbol] > max_weight + 1e-12:
                excess += w[symbol] - max_weight
                w[symbol] = max_weight
                changed = True
        totals: Dict[str, float] = {}
        for symbol, value in w.items():
            totals[sectors.get(symbol, "Unclassified")] = totals.get(sectors.get(symbol, "Unclassified"), 0.0) + value
        capped_sectors = set()
        for sector, total in totals.items():
            if total > sector_cap + 1e-12:
                scale = sector_cap / total
                for symbol in w:
                    if sectors.get(symbol, "Unclassified") == sector:
                        excess += w[symbol] * (1 - scale)
                        w[symbol] *= scale
                capped_sectors.add(sector)
                changed = True
            elif total >= sector_cap - 1e-12:
                capped_sectors.add(sector)
        if excess <= 1e-12:
            if not changed:
                break
            continue
        room = {
            symbol: max_weight - value
            for symbol, value in w.items()
            if value < max_weight - 1e-12 and sectors.get(symbol, "Unclassified") not in capped_sectors
        }
        total_room_base = sum(w[symbol] for symbol in room)
        if not room or total_room_base <= 0:
            break  # nowhere to put it: cash
        for symbol in room:
            w[symbol] += excess * w[symbol] / total_room_base
    # Hard guarantee whatever the redistribution did: caps hold, leftovers stay in cash.
    w = {symbol: min(value, max_weight) for symbol, value in w.items()}
    totals = {}
    for symbol, value in w.items():
        totals[sectors.get(symbol, "Unclassified")] = totals.get(sectors.get(symbol, "Unclassified"), 0.0) + value
    for symbol in w:
        total = totals[sectors.get(symbol, "Unclassified")]
        if total > sector_cap:
            w[symbol] *= sector_cap / total
    return w
