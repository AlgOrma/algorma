from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user
from ..models import User
from ..schemas import UserUpdate
from ..serialize import serialize_user
from ..utils import utcnow
from .auth import _normalize_email, _validate_name

router = APIRouter(prefix="/api/users", tags=["users"])

# With real authentication (AUTH_DESIGN.md) this router is /me-only:
# GET  /api/users      — removed; listing every account leaked all profiles.
# POST /api/users      — superseded by POST /api/auth/register.


@router.get("/me")
def get_me(user: User = Depends(get_current_user)):
    return serialize_user(user)


@router.patch("/me")
def update_me(
    payload: UserUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    data = payload.model_dump(exclude_unset=True)

    # Email and name are login identifiers, so edits here must uphold the same
    # invariants register enforces: normalized lowercase email, no '@' in
    # names, and case-insensitive uniqueness for both (a case-variant
    # duplicate would make login's func.lower lookups ambiguous).
    if data.get("email"):
        email = _normalize_email(data["email"])
        clash = session.exec(
            select(User).where(func.lower(User.email) == email, User.id != user.id)
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="Email already in use")
        data["email"] = email

    if data.get("name"):
        name = _validate_name(data["name"])
        clash = session.exec(
            select(User).where(
                func.lower(User.name) == name.lower(), User.id != user.id
            )
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="That username is taken")
        data["name"] = name

    for key, value in data.items():
        setattr(user, key, value)
    user.updated_at = utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return serialize_user(user)
