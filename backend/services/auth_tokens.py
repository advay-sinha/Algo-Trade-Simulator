"""Session token issuance and at-rest hashing.

Clients receive the raw token; the database only ever stores its SHA-256 digest, so a
leaked sessions collection cannot be replayed as bearer tokens.
"""

from __future__ import annotations

import hashlib
import secrets


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
