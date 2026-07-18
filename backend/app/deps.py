"""Request-scoped resolution of the "current user".

There is no authentication (by design). During first-run onboarding the frontend
creates a profile via ``POST /api/users``, then sends its id on every request as
an ``X-User-Id`` header. User-scoped endpoints require that header — there is no
default/fallback profile, so a fresh install starts with an empty users table.

Endpoints that are readable anonymously (the LeetCode catalog) use
``get_current_user_optional`` instead: an absent header means "anonymous", but a
header naming a nonexistent profile is still a 404, so a stale client id fails
loudly rather than silently downgrading to an anonymous view.
"""

from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlmodel import Session

from .db import get_session
from .models import User


def get_current_user(
    x_user_id: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    if not x_user_id:
        raise HTTPException(status_code=400, detail="Missing X-User-Id header")
    user = session.get(User, x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def get_current_user_optional(
    x_user_id: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
) -> Optional[User]:
    """Like ``get_current_user``, but for endpoints that are also usable
    anonymously: no header means no user, while a header that names a
    nonexistent profile is still an error rather than silent anonymity."""
    if not x_user_id:
        return None
    user = session.get(User, x_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
