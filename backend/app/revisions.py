"""Helpers for the partitioned SRS state (``Revision``).

A ``Revision`` row holds the spaced-repetition schedule for one item for one
user. Reads can just use the ``Problem.revision`` / ``Flashcard.revision``
relationship; these get-or-create helpers exist for the write paths (grading and
creation), where a row may not exist yet.
"""

from datetime import datetime

from sqlmodel import Session, select

from .models import ReviewLog, Revision
from .srs import replay, schedule


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


def grade_revision(
    session: Session, revision: Revision, grade: str, now: datetime
) -> Revision:
    """Apply one FSRS review to a revision row and append its ReviewLog.

    Rows last scheduled by the old SM-2 code (reviewed before, but no FSRS
    state yet) are first migrated by replaying their ReviewLog history.
    The caller commits.
    """
    if revision.stability is None and revision.review_count:
        item_filter = (
            ReviewLog.problem_id == revision.problem_id
            if revision.problem_id
            else ReviewLog.flashcard_id == revision.flashcard_id
        )
        logs = session.exec(
            select(ReviewLog)
            .where(item_filter, ReviewLog.user_id == revision.user_id)
            .order_by(ReviewLog.reviewed_at)
        ).all()
        revision.stability, revision.difficulty = replay(
            (log.grade, log.reviewed_at) for log in logs
        )

    result = schedule(
        revision.stability, revision.difficulty, revision.last_reviewed_at, grade, now
    )
    revision.algo = "fsrs"
    revision.stability = result["stability"]
    revision.difficulty = result["difficulty"]
    revision.interval_days = result["interval_days"]
    revision.repetitions = 0 if grade == "Again" else revision.repetitions + 1
    revision.review_count += 1
    revision.last_reviewed_at = now
    revision.due_at = result["due_at"]
    revision.updated_at = now

    session.add(
        ReviewLog(
            user_id=revision.user_id,
            grade=grade,
            interval_days=result["interval_days"],
            ease_factor=revision.ease_factor,
            problem_id=revision.problem_id,
            flashcard_id=revision.flashcard_id,
            reviewed_at=now,
        )
    )
    session.add(revision)
    return revision
