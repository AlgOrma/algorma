"""Flashcard business logic: CRUD and SRS grading."""

from datetime import datetime
from typing import Optional

from sqlalchemy import distinct, func, or_, update
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ..models import Deck, Flashcard, ReviewLog, Revision, User
from ..revisions import get_or_create_flashcard_revision, grade_revision
from ..schemas import FlashcardCreate, FlashcardUpdate
from ..serialize import DUE_WINDOW
from ..utils import utcnow
from .common import get_owned, require_valid_grade

# Deck filter/assignment value meaning "cards with no deck". Without a spelling
# for it, a caller asking for the unassigned bucket has to send an id that
# matches no row and silently gets an empty list back.
# Mirrors UNASSIGNED_DECK in frontend/src/data/initialData.js.
UNASSIGNED_DECK_ID = "__unassigned__"


def _resolve_deck_id(deck_id: Optional[str]) -> Optional[str]:
    """Normalise a deck id from a payload: "" and the unassigned sentinel both
    mean "no deck", so writes never try to look up a deck row for them."""
    if not deck_id or deck_id == UNASSIGNED_DECK_ID:
        return None
    return deck_id


def list_flashcards(
    session: Session, user: User, deck_id: Optional[str] = None
) -> list[Flashcard]:
    query = (
        select(Flashcard)
        .options(selectinload(Flashcard.deck), selectinload(Flashcard.revision))
        .where(Flashcard.user_id == user.id)
    )
    if deck_id == UNASSIGNED_DECK_ID:
        query = query.where(Flashcard.deck_id.is_(None))
    elif deck_id:
        query = query.where(Flashcard.deck_id == deck_id)
    return session.exec(query.order_by(Flashcard.created_at)).all()


def count_due_flashcards(session: Session, user: User) -> int:
    """Count the user's due cards in SQL, without hydrating a single row.

    Mirrors ``serialize.flashcard_is_due``: a card with no Revision row has never
    been scheduled and is due now; otherwise it is due once ``due_at`` falls
    inside ``DUE_WINDOW``.
    """
    cutoff = utcnow() + DUE_WINDOW
    return session.exec(
        select(func.count(distinct(Flashcard.id)))
        .select_from(Flashcard)
        .outerjoin(Revision, Revision.flashcard_id == Flashcard.id)
        .where(
            Flashcard.user_id == user.id,
            or_(Revision.id.is_(None), Revision.due_at <= cutoff),
        )
    ).one()


def create_flashcard(
    session: Session, user: User, payload: FlashcardCreate
) -> Flashcard:
    deck_id = _resolve_deck_id(payload.deck_id)
    if deck_id:
        # Validate user owns deck
        get_owned(session, Deck, deck_id, user, label="Deck")

    card = Flashcard(
        user_id=user.id,
        deck_id=deck_id,
        type=payload.type,
        tag=payload.tag,
        # Already stripped and checked non-blank by FlashcardCreate.
        front=payload.front,
        back=payload.back,
    )
    session.add(card)
    session.commit()
    session.refresh(card)
    return card


def get_flashcard(session: Session, user: User, card_id: str) -> Flashcard:
    return get_owned(session, Flashcard, card_id, user, label="Flashcard")


def update_flashcard(
    session: Session, user: User, card_id: str, payload: FlashcardUpdate
) -> Flashcard:
    card = get_flashcard(session, user, card_id)

    if payload.deck_id is not None:
        deck_id = _resolve_deck_id(payload.deck_id)
        if deck_id:
            get_owned(session, Deck, deck_id, user, label="Deck")
        card.deck_id = deck_id

    # front/back arrive stripped and non-blank from FlashcardUpdate.
    if payload.front is not None:
        card.front = payload.front
    if payload.back is not None:
        card.back = payload.back
    if payload.type is not None:
        card.type = payload.type
    if payload.tag is not None:
        card.tag = payload.tag

    card.updated_at = utcnow()
    session.add(card)
    session.commit()
    session.refresh(card)
    return card


def delete_flashcard(session: Session, user: User, card_id: str) -> None:
    card = get_flashcard(session, user, card_id)
    # Preserve the card's review history for dashboard stats: detach the
    # ReviewLog rows (the model no longer cascades them on delete) rather than
    # letting them disappear with the card. One bulk UPDATE over an indexed
    # column, not a loaded row plus an UPDATE per log.
    session.execute(
        update(ReviewLog)
        .where(ReviewLog.flashcard_id == card.id)
        .values(flashcard_id=None)
    )
    session.delete(card)
    session.commit()


def review_flashcard(
    session: Session, user: User, card_id: str, grade: str
) -> tuple[Flashcard, Revision, datetime]:
    require_valid_grade(grade)
    card = get_owned(session, Flashcard, card_id, user, label="Flashcard")

    now = utcnow()
    revision = get_or_create_flashcard_revision(session, user.id, card.id)
    grade_revision(session, revision, grade, now)
    card.updated_at = now
    session.add(card)
    session.commit()
    session.refresh(card)
    session.refresh(revision)
    return card, revision, now
