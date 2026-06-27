from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import Flashcard, ReviewLog
from ..schemas import GradeIn
from ..serialize import serialize_flashcard
from ..srs import VALID_GRADES, schedule
from ..utils import utcnow

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])


@router.get("")
def list_flashcards(
    due: bool | None = None, session: Session = Depends(get_session)
):
    now = utcnow()
    rows = [
        serialize_flashcard(c, now)
        for c in session.exec(select(Flashcard).order_by(Flashcard.created_at)).all()
    ]
    if due is True:
        rows = [r for r in rows if r["due"]]
    return rows


@router.post("/{card_id}/review")
def review_flashcard(
    card_id: str, payload: GradeIn, session: Session = Depends(get_session)
):
    if payload.grade not in VALID_GRADES:
        raise HTTPException(status_code=422, detail="Invalid grade")
    card = session.get(Flashcard, card_id)
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found")

    now = utcnow()
    result = schedule(
        card.ease_factor, card.interval_days, card.repetitions, payload.grade, now
    )
    card.ease_factor = result["ease_factor"]
    card.interval_days = result["interval_days"]
    card.repetitions = result["repetitions"]
    card.review_count += 1
    card.last_reviewed_at = now
    card.due_at = result["due_at"]
    card.updated_at = now

    session.add(
        ReviewLog(
            grade=payload.grade,
            interval_days=result["interval_days"],
            ease_factor=result["ease_factor"],
            flashcard_id=card.id,
            reviewed_at=now,
        )
    )
    session.add(card)
    session.commit()
    session.refresh(card)
    return serialize_flashcard(card)
