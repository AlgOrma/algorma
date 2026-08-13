from typing import Optional

from fastapi import APIRouter, Depends
from sqlmodel import Session

from ..db import get_session
from ..deps import get_current_user
from ..models import User
from ..schemas import FlashcardCreate, FlashcardUpdate, GradeIn
from ..serialize import flashcard_is_due, serialize_flashcard
from ..services import flashcards as flashcard_service
from ..utils import utcnow

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])


@router.get("")
def list_flashcards(
    due: Optional[bool] = None,
    deck_id: Optional[str] = None,
    intervals: bool = False,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """List the current user's cards.

    ``deck_id`` takes a deck id, or ``__unassigned__`` for cards with no deck.
    ``intervals=true`` adds the per-grade FSRS preview (``nextIntervals``) that
    the study screen labels its grade buttons with; it costs four scheduler
    passes per card, so the browse list leaves it off.
    """
    now = utcnow()
    cards = flashcard_service.list_flashcards(session, user, deck_id=deck_id)
    # Filter before serializing, so nothing is computed for rows we drop.
    if due is True:
        cards = [c for c in cards if flashcard_is_due(c.revision, now)]
    return [
        serialize_flashcard(c, c.revision, now, with_intervals=intervals)
        for c in cards
    ]


@router.get("/due-count")
def flashcard_due_count(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Due-card count for the sidebar badge — a single COUNT, no rows loaded."""
    return {"count": flashcard_service.count_due_flashcards(session, user)}


@router.post("", status_code=201)
def create_flashcard(
    payload: FlashcardCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    card = flashcard_service.create_flashcard(session, user, payload)
    return serialize_flashcard(card)


@router.get("/{card_id}")
def get_flashcard(
    card_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    now = utcnow()
    card = flashcard_service.get_flashcard(session, user, card_id)
    return serialize_flashcard(card, card.revision, now)


@router.patch("/{card_id}")
def update_flashcard(
    card_id: str,
    payload: FlashcardUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    now = utcnow()
    card = flashcard_service.update_flashcard(session, user, card_id, payload)
    return serialize_flashcard(card, card.revision, now)


@router.delete("/{card_id}", status_code=204)
def delete_flashcard(
    card_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    flashcard_service.delete_flashcard(session, user, card_id)
    return None


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
