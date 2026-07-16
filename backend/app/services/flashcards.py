"""Flashcard business logic: listing and grading."""

from datetime import datetime

from sqlmodel import Session, select

from ..models import Flashcard, Revision, User
from ..revisions import get_or_create_flashcard_revision, grade_revision
from ..utils import utcnow
from .common import get_owned, require_valid_grade


def list_flashcards(session: Session, user: User) -> list[Flashcard]:
    return session.exec(
        select(Flashcard)
        .where(Flashcard.user_id == user.id)
        .order_by(Flashcard.created_at)
    ).all()


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
