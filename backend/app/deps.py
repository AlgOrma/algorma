"""Request-scoped resolution of the current user from the session cookie.

AUTH_DESIGN.md: the cookie holds an opaque token; only its SHA-256 hash is
stored (``AuthSession.token_hash``). Missing/invalid/expired sessions are a
uniform 401 — the frontend routes that to the login screen.

Expiry is sliding: authenticated use pushes ``expires_at`` forward by the
full TTL, throttled to one write per ``_RENEW_INTERVAL`` so hot request
paths don't pay a DB write each time. An expired row encountered here is
deleted on the spot (the rest are purged on login — see routers/auth.py).
"""

from datetime import timedelta

from fastapi import Depends, HTTPException, Request
from sqlmodel import Session, select

from .config import settings
from .db import get_session
from .models import AuthSession, User
from .security import hash_token
from .utils import utcnow

SESSION_COOKIE = "algorma_session"

_RENEW_INTERVAL = timedelta(minutes=15)

_UNAUTHENTICATED = HTTPException(status_code=401, detail="Not authenticated")


def get_current_user(
    request: Request,
    session: Session = Depends(get_session),
) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise _UNAUTHENTICATED

    auth_session = session.exec(
        select(AuthSession).where(AuthSession.token_hash == hash_token(token))
    ).first()
    if auth_session is None:
        raise _UNAUTHENTICATED

    now = utcnow()
    if auth_session.expires_at <= now:
        session.delete(auth_session)
        session.commit()
        raise _UNAUTHENTICATED

    user = session.get(User, auth_session.user_id)
    if user is None:  # account deleted out from under a live session
        session.delete(auth_session)
        session.commit()
        raise _UNAUTHENTICATED

    if (
        auth_session.last_used_at is None
        or now - auth_session.last_used_at > _RENEW_INTERVAL
    ):
        auth_session.last_used_at = now
        auth_session.expires_at = now + timedelta(days=settings.session_ttl_days)
        session.add(auth_session)
        session.commit()

    return user
