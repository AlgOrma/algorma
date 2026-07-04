from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user
from ..models import Flashcard, User
from ..revisions import get_or_create_flashcard_revision, grade_revision
from ..schemas import GradeIn
from ..serialize import serialize_flashcard
from ..srs import VALID_GRADES
from ..utils import utcnow

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])


@router.get("")
def list_flashcards(
    due: bool | None = None,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    now = utcnow()
    stmt = (
        select(Flashcard)
        .where(Flashcard.user_id == user.id)
        .order_by(Flashcard.created_at)
    )
    rows = [serialize_flashcard(c, c.revision, now) for c in session.exec(stmt).all()]
    if due is True:
        rows = [r for r in rows if r["due"]]
    return rows


@router.post("/{card_id}/review")
def review_flashcard(
    card_id: str,
    payload: GradeIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if payload.grade not in VALID_GRADES:
        raise HTTPException(status_code=422, detail="Invalid grade")
    card = session.get(Flashcard, card_id)
    if not card or card.user_id != user.id:
        raise HTTPException(status_code=404, detail="Flashcard not found")

    now = utcnow()
    revision = get_or_create_flashcard_revision(session, user.id, card.id)
    grade_revision(session, revision, payload.grade, now)
    card.updated_at = now
    session.add(card)
    session.commit()
    session.refresh(card)
    session.refresh(revision)
    return serialize_flashcard(card, revision, now)
