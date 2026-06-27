"""Helpers for the partitioned SRS state (``Revision``).

A ``Revision`` row holds the spaced-repetition schedule for one item for one
user. Reads can just use the ``Problem.revision`` / ``Flashcard.revision``
relationship; these get-or-create helpers exist for the write paths (grading and
creation), where a row may not exist yet.
"""

from sqlmodel import Session, select

from .models import Revision


def get_or_create_problem_revision(
    session: Session, user_id: str, problem_id: str
) -> Revision:
    rev = session.exec(
        select(Revision).where(Revision.problem_id == problem_id)
    ).first()
    if rev is None:
        rev = Revision(user_id=user_id, problem_id=problem_id)
        session.add(rev)
    return rev


def get_or_create_flashcard_revision(
    session: Session, user_id: str, flashcard_id: str
) -> Revision:
    rev = session.exec(
        select(Revision).where(Revision.flashcard_id == flashcard_id)
    ).first()
    if rev is None:
        rev = Revision(user_id=user_id, flashcard_id=flashcard_id)
        session.add(rev)
    return rev
