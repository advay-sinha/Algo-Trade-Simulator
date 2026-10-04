"""Common strategy interface and registry.

A strategy turns daily bars into a long/flat signal series. The value at bar t may use only
data up to and including bar t; the backtester executes it at bar t+1's open, so strategies
never need to (and must not) look ahead.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, ClassVar, Dict, List, Type

import pandas as pd
from pydantic import BaseModel, ConfigDict


class StrategyParams(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Strategy(ABC):
    id: ClassVar[str]
    name: ClassVar[str]
    description: ClassVar[str]
    params_model: ClassVar[Type[StrategyParams]]

    def parse_params(self, raw: Dict[str, Any]) -> StrategyParams:
        return self.params_model(**raw)

    @abstractmethod
    def min_history(self, params: StrategyParams) -> int:
        """Bars needed before the first meaningful signal."""

    @abstractmethod
    def generate_signals(self, bars: pd.DataFrame, params: StrategyParams) -> pd.Series:
        """Return a 0/1 series aligned to `bars.index` (1 = hold a long position)."""

    def describe(self) -> Dict[str, Any]:
        schema = self.params_model.model_json_schema()
        fields: List[Dict[str, Any]] = []
        for name, spec in schema.get("properties", {}).items():
            fields.append(
                {
                    "name": name,
                    "label": spec.get("title", name),
                    "type": spec.get("type", "number"),
                    "default": spec.get("default"),
                    "minimum": spec.get("minimum", spec.get("exclusiveMinimum")),
                    "maximum": spec.get("maximum", spec.get("exclusiveMaximum")),
                    "description": spec.get("description"),
                }
            )
        return {"id": self.id, "name": self.name, "description": self.description, "parameters": fields}


REGISTRY: Dict[str, Strategy] = {}


def register(strategy: Strategy) -> Strategy:
    REGISTRY[strategy.id] = strategy
    return strategy


def get_strategy(strategy_id: str) -> Strategy:
    try:
        return REGISTRY[strategy_id]
    except KeyError as exc:
        raise KeyError(f"Unknown strategy: {strategy_id}") from exc


def list_strategies() -> List[Dict[str, Any]]:
    return [strategy.describe() for strategy in REGISTRY.values()]
