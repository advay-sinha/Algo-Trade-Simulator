"""Research NLP: financial sentiment, research notes (memory), and semantic retrieval."""
from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status

from backend.deps import Store, get_current_user, get_store
from backend.llm import rag
from backend.models.research import NoteCreate, NoteKind, RagQuery, SentimentRequest
from backend.services import hf_inference, sentiment_service
from backend.services.hf_inference import NlpError
from backend.services.rate_limiter import rate_limit
from backend.stores import public_note

router = APIRouter(prefix="/api")

nlp_rate_limit = rate_limit("research-nlp", 30)
notes_rate_limit = rate_limit("research-notes", 60)


def _nlp_http(exc: NlpError) -> HTTPException:
    headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
    return HTTPException(status_code=exc.status_code, detail=exc.message, headers=headers)


@router.post("/research/sentiment", dependencies=[Depends(nlp_rate_limit)])
async def analyze_sentiment(payload: SentimentRequest, user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Bullish / bearish / neutral with confidence for each text (FinBERT by default)."""
    _ = user
    if not hf_inference.configured():
        raise _nlp_http(hf_inference.NlpNotConfigured())
    try:
        return await asyncio.to_thread(sentiment_service.analyze, payload.texts)
    except NlpError as exc:
        raise _nlp_http(exc) from exc


@router.post("/research/notes", dependencies=[Depends(notes_rate_limit)])
async def create_note(
    payload: NoteCreate,
    response: Response,
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> Dict[str, Any]:
    """Save a note, or a saved backtest/model as a summary note. Notes are embedded for retrieval
    when NLP is configured; otherwise they are saved unindexed and indexed on a later query."""
    try:
        record = await rag.create_note(store, user["id"], payload.kind, payload.title, payload.body, payload.refId, payload.tags)
    except rag.NoteError as exc:
        if exc.findings:
            raise HTTPException(status_code=exc.status, detail={"code": "personal_data_detected", "message": exc.message, "findings": exc.findings}) from exc
        raise HTTPException(status_code=exc.status, detail=exc.message) from exc
    response.status_code = status.HTTP_201_CREATED if record.pop("_created") else status.HTTP_200_OK
    return public_note(record)


@router.get("/research/notes")
async def list_notes(
    kind: Optional[NoteKind] = None,
    limit: int = Query(default=100, ge=1, le=200),
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> List[Dict[str, Any]]:
    """Your research notes, newest first (embeddings are never returned)."""
    return [public_note(record) for record in await store.list_notes(user["id"], kind, limit)]


@router.delete("/research/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: str = Path(min_length=1, max_length=64),
    user: Dict[str, Any] = Depends(get_current_user),
    store: Store = Depends(get_store),
) -> Response:
    if not await store.delete_note(user["id"], note_id):
        raise HTTPException(status_code=404, detail="Note not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/research/rag/query", dependencies=[Depends(nlp_rate_limit)])
async def query_notes(payload: RagQuery, user: Dict[str, Any] = Depends(get_current_user), store: Store = Depends(get_store)) -> Dict[str, Any]:
    """Your notes ranked by semantic similarity to the query (cosine, -1..1)."""
    try:
        return await rag.query(store, user["id"], payload.query, payload.k, payload.minScore)
    except NlpError as exc:
        raise _nlp_http(exc) from exc
