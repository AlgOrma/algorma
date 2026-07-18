"""Shared identity validation for the auth and users routers.

These rules define what a login identifier may *be*, so every endpoint that
sets one — POST /api/auth/register and PATCH /api/users/me — has to apply the
identical set. A value one endpoint accepted and the other rejected would
leave rows that login's case-insensitive lookups can't resolve unambiguously.

Lives outside ``routers/`` so neither router has to reach into the other's
private names to share them.
"""

from email_validator import EmailNotValidError, validate_email
from fastapi import HTTPException

# NIST 800-63B: length is the policy — no composition rules. The cap only
# bounds Argon2 hashing cost. The frontend enforces the same minimum.
MIN_PASSWORD = 8
MAX_PASSWORD = 128
MAX_NAME = 50


def normalize_email(raw: str) -> str:
    """Syntax-validate and lowercase, so lookups are case-insensitive."""
    try:
        return validate_email(raw.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        raise HTTPException(status_code=400, detail="That email doesn't look right.")


def validate_password(password: str) -> None:
    if len(password) < MIN_PASSWORD:
        raise HTTPException(
            status_code=400,
            detail=f"Your password needs at least {MIN_PASSWORD} characters.",
        )
    if len(password) > MAX_PASSWORD:
        raise HTTPException(
            status_code=400,
            detail=f"Passwords are capped at {MAX_PASSWORD} characters.",
        )


def validate_name(raw: str) -> str:
    name = raw.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Pick a username to continue.")
    if len(name) > MAX_NAME:
        raise HTTPException(
            status_code=400, detail=f"Usernames are capped at {MAX_NAME} characters."
        )
    if "@" in name:
        # Login accepts "email or username"; keeping '@' out of usernames
        # keeps that lookup unambiguous.
        raise HTTPException(status_code=400, detail="Usernames can't contain '@'.")
    return name

