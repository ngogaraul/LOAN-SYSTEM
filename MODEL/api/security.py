from __future__ import annotations

import secrets

from fastapi import Header, HTTPException, status


def verify_api_key(provided_key: str | None, expected_key: str) -> None:
    if not provided_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key.",
        )
    if not secrets.compare_digest(provided_key, expected_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key.",
        )


def api_key_dependency(expected_key: str):
    def _dependency(x_api_key: str | None = Header(default=None)) -> None:
        verify_api_key(x_api_key, expected_key)

    return _dependency
