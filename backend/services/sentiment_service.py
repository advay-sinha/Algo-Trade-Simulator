"""Financial sentiment: bullish / bearish / neutral with a confidence, from FinBERT by default."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from backend.config import settings
from backend.services import hf_inference

LABELS = ("bullish", "bearish", "neutral")
_ALIASES = {
    "positive": "bullish",
    "bullish": "bullish",
    "pos": "bullish",
    "negative": "bearish",
    "bearish": "bearish",
    "neg": "bearish",
    "neutral": "neutral",
}


def _canonical(label: str) -> Optional[str]:
    return _ALIASES.get(label.strip().lower())


def summarize(scores: List[Dict[str, Any]]) -> Dict[str, Any]:
    """One result from a model's label scores. Unknown labels are ignored; missing labels are null."""
    mapped: Dict[str, Optional[float]] = {label: None for label in LABELS}
    for item in scores:
        label = _canonical(item["label"])
        if label is not None:
            mapped[label] = round(float(item["score"]), 4)
    known = {label: score for label, score in mapped.items() if score is not None}
    if not known:
        return {"label": "neutral", "confidence": None, "scores": mapped}
    best = max(known, key=lambda label: known[label])
    return {"label": best, "confidence": known[best], "scores": mapped}


def analyze(texts: Sequence[str]) -> Dict[str, Any]:
    """Blocking (call via asyncio.to_thread)."""
    rows = hf_inference.classify(texts)
    results = [{"text": text[:160]} | summarize(row) for text, row in zip(texts, rows)]
    return {"provider": hf_inference.provider(), "model": settings.sentiment_model, "results": results}
