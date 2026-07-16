from fastapi import APIRouter, Depends
from sqlmodel import Session

from ..db import get_session
from ..deps import get_current_user
from ..models import User
from ..schemas import GradeIn
from ..serialize import serialize_flashcard
from ..services import flashcards as flashcard_service
from ..utils import utcnow

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])


@router.get("")
def list_flashcards(
    due: bool | None = None,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    now = utcnow()
    cards = flashcard_service.list_flashcards(session, user)
    rows = [serialize_flashcard(c, c.revision, now) for c in cards]
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
    card, revision, now = flashcard_service.review_flashcard(
        session, user, card_id, payload.grade
    )
    return serialize_flashcard(card, revision, now)
