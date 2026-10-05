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


Maturity = str  # "baseline" | "research" | "validated" — method maturity, never a quality claim


def describe_params(params_model: Type[StrategyParams]) -> List[Dict[str, Any]]:
    schema = params_model.model_json_schema()
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
                "options": spec.get("enum"),
                "description": spec.get("description"),
            }
        )
    return fields


class Strategy(ABC):
    id: ClassVar[str]
    name: ClassVar[str]
    description: ClassVar[str]
    params_model: ClassVar[Type[StrategyParams]]
    # Declared metadata (Phase 13b): what the strategy needs and how it behaves.
    data_requirements: ClassVar[str] = "Daily closes of one symbol."
    holding_horizon: ClassVar[str] = "Until the signal changes."
    risk_controls: ClassVar[List[str]] = ["Long or flat only (no shorting, no leverage)."]
    maturity: ClassVar[Maturity] = "baseline"

    def parse_params(self, raw: Dict[str, Any]) -> StrategyParams:
        return self.params_model(**raw)

    @abstractmethod
    def min_history(self, params: StrategyParams) -> int:
        """Bars needed before the first meaningful signal."""

    @abstractmethod
    def generate_signals(self, bars: pd.DataFrame, params: StrategyParams) -> pd.Series:
        """Return a 0/1 series aligned to `bars.index` (1 = hold a long position)."""

    def metadata(self) -> Dict[str, Any]:
        defaults = self.params_model()
        return {
            "executionMode": "single-asset",
            "dataRequirements": self.data_requirements,
            "warmupSessions": self.min_history(defaults),
            "rebalance": "daily",
            "holdingHorizon": self.holding_horizon,
            "riskControls": list(self.risk_controls),
            "maturity": self.maturity,
        }

    def describe(self) -> Dict[str, Any]:
        fields = describe_params(self.params_model)
        for field in fields:
            field.pop("options", None)  # unchanged response shape for the single-asset catalog
        return {"id": self.id, "name": self.name, "description": self.description, "parameters": fields, "metadata": self.metadata()}


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
