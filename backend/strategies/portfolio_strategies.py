"""Importing this module registers every universe strategy (Phase 13)."""

from __future__ import annotations

from typing import Any, Dict, List

from backend.strategies import equal_weight, ml_ranking, vol_trend, xs_momentum  # noqa: F401  (registration side effects)
from backend.strategies.portfolio_base import PORTFOLIO_REGISTRY, PortfolioStrategy

BASELINE_ID = "equal-weight-universe"


def get_portfolio_strategy(strategy_id: str) -> PortfolioStrategy:
    try:
        return PORTFOLIO_REGISTRY[strategy_id]
    except KeyError as exc:
        raise KeyError(f"Unknown universe strategy: {strategy_id}") from exc


def list_portfolio_strategies() -> List[Dict[str, Any]]:
    return [strategy.describe() for strategy in PORTFOLIO_REGISTRY.values()]
