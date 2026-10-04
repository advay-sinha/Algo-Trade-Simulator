"""Lab trainer and legacy chat request models."""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from backend.models.common import SYMBOL_PATTERN


class TrainingPayload(BaseModel):
    symbol: str = Field(pattern=SYMBOL_PATTERN)
    shortWindow: int = Field(gt=1, le=200)
    longWindow: int = Field(gt=2, le=400)
    strategyId: Optional[str] = Field(default=None, max_length=60)


class PredictionPayload(BaseModel):
    symbol: str = Field(pattern=SYMBOL_PATTERN)


class ChatHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: List[ChatHistoryItem] = Field(default_factory=list)
