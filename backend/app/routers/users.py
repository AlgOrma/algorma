from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user
from ..models import User
from ..schemas import UserCreate, UserUpdate
from ..seed import seed_starter_patterns
from ..serialize import serialize_user
from ..utils import utcnow

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("")
def list_users(session: Session = Depends(get_session)):
    """All profiles — handy for a future profile switcher."""
    users = session.exec(select(User).order_by(User.created_at)).all()
    return [serialize_user(u) for u in users]


@router.post("", status_code=201)
def create_user(payload: UserCreate, session: Session = Depends(get_session)):
    if payload.email:
        existing = session.exec(
            select(User).where(User.email == payload.email)
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="Email already in use")

    user = User(
        name=payload.name,
        email=payload.email,
        timezone=payload.timezone,
        daily_goal=payload.daily_goal,
        bio=payload.bio,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    # Give the new profile an editable starter template library.
    seed_starter_patterns(session, user.id)

    return serialize_user(user)


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

    new_email = data.get("email")
    if new_email and new_email != user.email:
        clash = session.exec(select(User).where(User.email == new_email)).first()
        if clash:
            raise HTTPException(status_code=409, detail="Email already in use")

    for key, value in data.items():
        setattr(user, key, value)
    user.updated_at = utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return serialize_user(user)
