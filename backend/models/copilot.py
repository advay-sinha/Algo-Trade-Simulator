"""Request models for the copilot API."""

from __future__ import annotations

from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field


class CopilotTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class CopilotChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: List[CopilotTurn] = Field(default_factory=list, max_length=20)


class CopilotActionRequest(BaseModel):
    """Structured action execution — no free-text parsing, same validation as the REST endpoints."""

    action: Literal["run_backtest", "train_model", "create_simulation"]
    params: Dict[str, Any] = Field(default_factory=dict)
