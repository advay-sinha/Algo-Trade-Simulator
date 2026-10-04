"""Strategy package. Importing it registers every built-in strategy."""

from backend.strategies import buy_and_hold, mean_reversion, momentum, sma_crossover  # noqa: F401  (registration side effects)
from backend.strategies.base import REGISTRY, Strategy, StrategyParams, get_strategy, list_strategies

__all__ = ["REGISTRY", "Strategy", "StrategyParams", "get_strategy", "list_strategies"]
