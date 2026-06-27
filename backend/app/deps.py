"""Request-scoped resolution of the "current user".

There is no authentication (by design). The frontend creates a profile via
``POST /api/users`` and then sends its id on every request as an ``X-User-Id``
header. When the header is absent we fall back to the seeded default profile so
the not-yet-wired localStorage frontend (and ``/docs``) keep working.
"""

from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlmodel import Session, select

from .db import get_session
from .models import User

# Email of the profile created by ``python -m app.seed``.
DEFAULT_USER_EMAIL = "default@algorma.local"


def get_current_user(
    x_user_id: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    if x_user_id:
        user = session.get(User, x_user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    user = session.exec(
        select(User).where(User.email == DEFAULT_USER_EMAIL)
    ).first()
    if not user:
        raise HTTPException(
            status_code=400,
            detail="No X-User-Id provided and no default profile seeded.",
        )
    return user
