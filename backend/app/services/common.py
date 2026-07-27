"""Helpers shared across the per-domain service modules."""

from typing import TypeVar

from fastapi import HTTPException
from sqlmodel import Session, SQLModel

from ..models import User
from ..srs import VALID_GRADES

T = TypeVar("T", bound=SQLModel)


def get_owned(
    session: Session, model: type[T], obj_id: str, user: User, *, label: str
) -> T:
    """Load a user-owned row by primary key.

    Missing and not-owned are both 404 so the API never confirms that another
    user's id exists. Curriculums don't fit this shape (nullable owner, 403 for
    global rows) — see ``services.curriculums``.
    """
    obj = session.get(model, obj_id)
    if not obj or obj.user_id != user.id:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return obj


def require_valid_grade(grade: str) -> None:
    if grade not in VALID_GRADES:
        raise HTTPException(status_code=422, detail="Invalid grade")
