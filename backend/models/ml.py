"""Request models for the ML pipeline API."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field

from backend.models.common import SYMBOL_PATTERN

DatasetRange = Literal["1y", "2y", "5y"]
LabelKindField = Literal["direction", "return_bucket", "volatility_regime"]


class FeaturesRequest(BaseModel):
    symbol: str = Field(pattern=SYMBOL_PATTERN)
    range: DatasetRange = "2y"
    features: Optional[Union[List[str], Dict[str, Dict[str, Any]]]] = Field(
        default=None, description="Feature names, or {name: params}; defaults to every feature with default parameters."
    )
    label: LabelKindField = "direction"
    horizon: int = Field(default=1, ge=1, le=20, description="Bars ahead the label looks.")
    testFraction: float = Field(default=0.25, ge=0.05, le=0.5)
    embargo: int = Field(default=1, ge=1, le=20, description="Minimum bars between train end and test start.")


ModelTypeField = Literal["logistic", "random_forest", "gradient_boosting"]


class TrainModelRequest(FeaturesRequest):
    model: ModelTypeField = "logistic"
    costBps: float = Field(default=5, ge=0, le=500, description="Costs used when backtesting the model's test-window signals.")
    slippageBps: float = Field(default=5, ge=0, le=500)


class PredictRequest(BaseModel):
    modelId: Optional[str] = Field(default=None, min_length=1, max_length=64)
    symbol: Optional[str] = Field(default=None, pattern=SYMBOL_PATTERN)
