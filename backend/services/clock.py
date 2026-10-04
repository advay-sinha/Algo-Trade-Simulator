"""Timezone-aware UTC clock shared by the app and services."""

from datetime import datetime, timezone


def now() -> datetime:
    return datetime.now(timezone.utc)
