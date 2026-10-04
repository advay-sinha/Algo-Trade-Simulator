"""Request models for research NLP: sentiment, notes, retrieval."""

from __future__ import annotations

from typing import Annotated, List, Literal, Optional

from pydantic import BaseModel, Field, StringConstraints, model_validator

SentimentText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=24)]
NoteKind = Literal["note", "backtest", "model"]


class SentimentRequest(BaseModel):
    texts: List[SentimentText] = Field(min_length=1, max_length=20, description="Headlines or short passages (up to 20).")


class NoteCreate(BaseModel):
    kind: NoteKind = "note"
    title: Optional[str] = Field(default=None, max_length=120)
    body: Optional[str] = Field(default=None, max_length=5000, description="Note text; for backtest/model notes, an optional comment appended to the summary.")
    refId: Optional[str] = Field(default=None, min_length=1, max_length=64, description="Backtest or model id for kind=backtest|model.")
    tags: List[Tag] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def check_kind(self) -> "NoteCreate":
        if self.kind == "note" and not ((self.title or "").strip() and (self.body or "").strip()):
            raise ValueError("A note needs a title and a body")
        if self.kind != "note" and not self.refId:
            raise ValueError("refId is required for backtest and model notes")
        return self


class RagQuery(BaseModel):
    query: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    k: int = Field(default=5, ge=1, le=10)
    minScore: float = Field(default=0.0, ge=-1.0, le=1.0, description="Minimum cosine similarity to return.")
