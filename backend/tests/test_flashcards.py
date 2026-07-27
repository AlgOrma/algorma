"""Flashcards router: listing (due filter) and the review/grade flow.

The router is feature-flagged off by default (settings.enable_flashcards), so
it is not mounted on the app — the router functions are called directly with
the session/user fixtures instead of going through the HTTP client.
"""

from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlmodel import select

from app.models import Flashcard, ReviewLog, Revision, User
from app.routers.flashcards import list_flashcards, review_flashcard
from app.schemas import GradeIn
from app.utils import utcnow


def make_card(session, user, **kwargs):
    defaults = dict(type="concept", tag="arrays", front="Q?", back="A.")
    defaults.update(kwargs)
    card = Flashcard(user_id=user.id, **defaults)
    session.add(card)
    session.commit()
    session.refresh(card)
    return card


def make_other_user(session):
    other = User(name="Other User")
    session.add(other)
    session.commit()
    session.refresh(other)
    return other


# --- listing ---


def test_list_empty_when_user_has_no_cards(session, user):
    assert list_flashcards(user=user, session=session) == []


def test_list_returns_cards_oldest_first_with_fresh_srs_defaults(session, user):
    make_card(
        session, user, front="newer", created_at=datetime(2026, 7, 2, 12, 0, 0)
    )
    make_card(
        session, user, front="older", created_at=datetime(2026, 7, 1, 12, 0, 0)
    )

    rows = list_flashcards(user=user, session=session)

    assert [r["front"] for r in rows] == ["older", "newer"]
    row = rows[0]
    assert row["type"] == "concept"
    assert row["tag"] == "arrays"
    assert row["back"] == "A."
    # Never reviewed: no revision row, so serializer falls back to defaults.
    assert row["due"] is False
    assert row["reviewCount"] == 0
    assert row["easeFactor"] == 2.5
    assert row["intervalDays"] == 0
    assert row["srsStability"] is None
    assert row["lastReviewedAt"] is None
    assert row["dueAt"] is None
    # First-review previews still offered for the grade buttons.
    assert row["nextIntervals"]["Again"] == 0
    assert row["nextIntervals"]["Good"] >= 1


def test_due_filter_keeps_only_overdue_and_due_today(session, user):
    now = utcnow()
    overdue = make_card(session, user, front="overdue")
    today = make_card(session, user, front="today")
    future = make_card(session, user, front="future")
    fresh = make_card(session, user, front="fresh")  # no revision at all

    def seed_revision(card, due_at, last_reviewed_at):
        session.add(
            Revision(
                user_id=user.id,
                flashcard_id=card.id,
                review_count=1,
                last_reviewed_at=last_reviewed_at,
                due_at=due_at,
                stability=5.0,
                difficulty=5.0,
            )
        )

    seed_revision(overdue, now - timedelta(days=3), now - timedelta(days=10))
    # Due in a few hours: rounds to 0 days out, so it still counts as due.
    seed_revision(today, now + timedelta(hours=6), now - timedelta(days=5))
    seed_revision(future, now + timedelta(days=10), now - timedelta(days=1))
    session.commit()

    all_rows = list_flashcards(user=user, session=session)
    due_rows = list_flashcards(due=True, user=user, session=session)

    assert {r["front"] for r in all_rows} == {"overdue", "today", "future", "fresh"}
    assert [r["front"] for r in due_rows] == ["overdue", "today"]
    assert all(r["due"] is True for r in due_rows)
    assert fresh.id not in {r["id"] for r in due_rows}


def test_list_excludes_other_users_cards(session, user):
    other = make_other_user(session)
    make_card(session, other, front="theirs")
    mine = make_card(session, user, front="mine")

    rows = list_flashcards(user=user, session=session)

    assert [r["id"] for r in rows] == [mine.id]
    assert rows[0]["front"] == "mine"


# --- review / grade flow ---


def test_first_review_creates_revision_and_log(session, user):
    card = make_card(session, user)
    before = card.updated_at

    row = review_flashcard(card.id, GradeIn(grade="Good"), user=user, session=session)

    revision = session.exec(
        select(Revision).where(Revision.flashcard_id == card.id)
    ).one()
    assert revision.user_id == user.id
    assert revision.algo == "fsrs"
    assert revision.review_count == 1
    assert revision.stability is not None
    assert revision.difficulty is not None
    assert revision.due_at > revision.last_reviewed_at

    [log] = session.exec(select(ReviewLog)).all()
    assert log.grade == "Good"
    assert log.flashcard_id == card.id
    assert log.user_id == user.id
    assert log.interval_days == revision.interval_days

    # Response is the serialized card with the fresh SRS state.
    assert row["id"] == card.id
    assert row["reviewCount"] == 1
    assert row["due"] is False  # "Good" schedules at least a day out
    assert row["srsStability"] == revision.stability
    assert row["dueAt"] == revision.due_at.isoformat() + "Z"
    # updated_at is bumped to the review timestamp itself.
    session.refresh(card)
    assert card.updated_at == revision.last_reviewed_at
    assert card.updated_at > before


def test_second_review_updates_the_same_revision_row(session, user):
    card = make_card(session, user)

    review_flashcard(card.id, GradeIn(grade="Good"), user=user, session=session)
    row = review_flashcard(card.id, GradeIn(grade="Good"), user=user, session=session)

    revisions = session.exec(
        select(Revision).where(Revision.flashcard_id == card.id)
    ).all()
    assert len(revisions) == 1
    assert revisions[0].review_count == 2
    assert row["reviewCount"] == 2
    logs = session.exec(select(ReviewLog)).all()
    assert len(logs) == 2


def test_again_keeps_card_due_and_resets_streak(session, user):
    card = make_card(session, user)

    review_flashcard(card.id, GradeIn(grade="Good"), user=user, session=session)
    row = review_flashcard(card.id, GradeIn(grade="Again"), user=user, session=session)

    assert row["due"] is True
    assert row["intervalDays"] == 0
    assert row["repetitions"] == 0
    revision = session.exec(
        select(Revision).where(Revision.flashcard_id == card.id)
    ).one()
    assert revision.due_at == revision.last_reviewed_at


def test_invalid_grade_rejected_without_side_effects(session, user):
    card = make_card(session, user)

    with pytest.raises(HTTPException) as exc:
        review_flashcard(
            card.id, GradeIn(grade="Amazing"), user=user, session=session
        )

    assert exc.value.status_code == 422
    assert session.exec(select(Revision)).all() == []
    assert session.exec(select(ReviewLog)).all() == []


def test_review_missing_card_404(session, user):
    with pytest.raises(HTTPException) as exc:
        review_flashcard(
            "nope", GradeIn(grade="Good"), user=user, session=session
        )

    assert exc.value.status_code == 404


def test_review_other_users_card_404_and_leaves_no_state(session, user):
    other = make_other_user(session)
    theirs = make_card(session, other)

    with pytest.raises(HTTPException) as exc:
        review_flashcard(
            theirs.id, GradeIn(grade="Good"), user=user, session=session
        )

    assert exc.value.status_code == 404
    assert session.exec(select(Revision)).all() == []
    assert session.exec(select(ReviewLog)).all() == []
