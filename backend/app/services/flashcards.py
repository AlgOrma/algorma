"""Flashcard business logic: CRUD and SRS grading."""

from datetime import datetime
from typing import Optional

from sqlmodel import Session, select

from ..models import Deck, Flashcard, Revision, User
from ..revisions import get_or_create_flashcard_revision, grade_revision
from ..schemas import FlashcardCreate, FlashcardUpdate
from ..utils import utcnow
from .common import get_owned, require_valid_grade


def list_flashcards(
    session: Session, user: User, deck_id: Optional[str] = None
) -> list[Flashcard]:
    query = select(Flashcard).where(Flashcard.user_id == user.id)
    if deck_id is not None:
        query = query.where(Flashcard.deck_id == deck_id)
    return session.exec(query.order_by(Flashcard.created_at)).all()


def create_flashcard(
    session: Session, user: User, payload: FlashcardCreate
) -> Flashcard:
    if payload.deck_id:
        # Validate user owns deck
        get_owned(session, Deck, payload.deck_id, user, label="Deck")

    card = Flashcard(
        user_id=user.id,
        deck_id=payload.deck_id,
        type=payload.type,
        tag=payload.tag,
        front=payload.front.strip(),
        back=payload.back.strip(),
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
        if payload.deck_id != "":
            get_owned(session, Deck, payload.deck_id, user, label="Deck")
            card.deck_id = payload.deck_id
        else:
            card.deck_id = None

    if payload.front is not None:
        card.front = payload.front.strip()
    if payload.back is not None:
        card.back = payload.back.strip()
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
