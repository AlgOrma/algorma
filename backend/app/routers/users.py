from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user
from ..models import User
from ..schemas import UserUpdate
from ..serialize import serialize_user
from ..utils import utcnow
from ..validation import normalize_email, validate_name

router = APIRouter(prefix="/api/users", tags=["users"])

# With real authentication (AUTH_DESIGN.md) this router is /me-only:
# GET  /api/users      — removed; listing every account leaked all profiles.
# POST /api/users      — superseded by POST /api/auth/register.


# UserUpdate types every field ``| None`` so PATCH stays sparse, but that says
# nothing about whether the *column* accepts NULL — ``timezone`` and
# ``daily_goal`` have defaults, not nullability. Asking the mapper instead of
# listing names by hand means a future non-nullable column added to UserUpdate
# is covered the day it lands, rather than silently reaching the setattr loop
# and failing as an IntegrityError -> 500. Maps field name -> wire (camelCase)
# name so the 400 names the key the client actually sent.
_NOT_NULL_FIELDS = {
    field: (info.alias or field)
    for field, info in UserUpdate.model_fields.items()
    if (col := User.__table__.columns.get(field)) is not None and not col.nullable
}


def _require_identifier(data: dict, key: str, label: str) -> str:
    """Reject a present-but-empty login identifier.

    PATCH is sparse, so *omitting* a key means "leave it alone" — but a key
    that is present and blank (``""``, whitespace, or ``null``) is a request to
    clear it. Clearing isn't supported: an account with no email and no name
    has no way back in, and blanks collide with each other under the
    case-insensitive uniqueness checks below.
    """
    value = data[key]
    if not isinstance(value, str) or not value.strip():
        raise HTTPException(status_code=400, detail=f"Your {label} can't be empty.")
    return value


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
    if "email" in data:
        email = normalize_email(_require_identifier(data, "email", "email"))
        clash = session.exec(
            select(User).where(func.lower(User.email) == email, User.id != user.id)
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="Email already in use")
        data["email"] = email

    if "name" in data:
        name = validate_name(_require_identifier(data, "name", "username"))
        clash = session.exec(
            select(User).where(
                func.lower(User.name) == name.lower(), User.id != user.id
            )
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail="That username is taken")
        data["name"] = name

    # Everything left is written straight through, so a null aimed at a NOT NULL
    # column would only surface at commit as a driver IntegrityError (a 500 any
    # authenticated user could trigger). Runs after the identity blocks above so
    # name/email keep their more specific "can't be empty" wording; genuinely
    # nullable fields (bio, leetcodeUsername) are absent from the set and still
    # accept null as "clear this".
    for key, wire_name in _NOT_NULL_FIELDS.items():
        if key in data and data[key] is None:
            raise HTTPException(
                status_code=400, detail=f"Your {wire_name} can't be null."
            )

    for key, value in data.items():
        setattr(user, key, value)
    user.updated_at = utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return serialize_user(user)
