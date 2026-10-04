"""Vercel Python function: serves the FastAPI app for every /api/* path (see vercel.json)."""

from backend.main import app

__all__ = ["app"]
