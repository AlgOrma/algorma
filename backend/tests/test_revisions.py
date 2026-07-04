"""grade_revision: FSRS state transitions and the legacy SM-2 replay path."""

from datetime import datetime, timedelta

from sqlmodel import select

from app.models import Problem, ReviewLog, Revision, User
from app.revisions import grade_revision
from app.srs import replay, schedule

NOW = datetime(2026, 7, 4, 12, 0, 0)


def make_problem(session, user, topic, **kwargs):
    p = Problem(
        user_id=user.id, title="Two Sum", topic_id=topic.id, difficulty="Easy", **kwargs
    )
    session.add(p)
    session.commit()
    session.refresh(p)
    return p


def test_first_grade_creates_fsrs_state(session, user, topic):
    problem = make_problem(session, user, topic)
    revision = Revision(user_id=user.id, problem_id=problem.id)
    session.add(revision)

    grade_revision(session, revision, "Good", NOW)
    session.commit()

    assert revision.algo == "fsrs"
    assert revision.stability is not None
    assert revision.difficulty is not None
    assert revision.review_count == 1
    assert revision.last_reviewed_at == NOW
    assert revision.due_at > NOW

    logs = session.exec(select(ReviewLog)).all()
    assert len(logs) == 1
    assert logs[0].grade == "Good"
    assert logs[0].problem_id == problem.id
    assert logs[0].user_id == user.id


def test_legacy_sm2_row_replays_its_history(session, user, topic):
    problem = make_problem(session, user, topic)
    history = [("Good", NOW - timedelta(days=8)), ("Hard", NOW - timedelta(days=3))]
    for grade, at in history:
        session.add(
            ReviewLog(
                user_id=user.id, grade=grade, interval_days=1,
                ease_factor=2.5, problem_id=problem.id, reviewed_at=at,
            )
        )
    # A row the old SM-2 code scheduled: reviews happened, but no FSRS state.
    revision = Revision(
        user_id=user.id, problem_id=problem.id, algo="sm2",
        review_count=2, stability=None, difficulty=None,
        last_reviewed_at=history[-1][1],
    )
    session.add(revision)
    session.commit()

    grade_revision(session, revision, "Good", NOW)
    session.commit()

    # Expected: replay the two logged reviews, then apply today's grade.
    s, d = replay(history)
    expected = schedule(s, d, history[-1][1], "Good", NOW)
    assert revision.algo == "fsrs"
    assert revision.stability == expected["stability"]
    assert revision.difficulty == expected["difficulty"]
    assert revision.due_at == expected["due_at"]
    assert revision.review_count == 3


def test_replay_ignores_other_users_logs(session, user, topic):
    problem = make_problem(session, user, topic)
    own_history = [("Good", NOW - timedelta(days=5))]
    session.add(
        ReviewLog(
            user_id=user.id, grade="Good", interval_days=1,
            ease_factor=2.5, problem_id=problem.id, reviewed_at=own_history[0][1],
        )
    )
    # Another user's log against the same problem id must not leak into the
    # replay (defense in depth — content sharing would otherwise corrupt state).
    other = User(name="Someone Else")
    session.add(other)
    session.commit()
    session.add(
        ReviewLog(
            user_id=other.id, grade="Again", interval_days=0,
            ease_factor=2.5, problem_id=problem.id, reviewed_at=NOW - timedelta(days=1),
        )
    )
    revision = Revision(
        user_id=user.id, problem_id=problem.id, algo="sm2",
        review_count=1, last_reviewed_at=own_history[0][1],
    )
    session.add(revision)
    session.commit()

    grade_revision(session, revision, "Good", NOW)
    session.commit()

    s, d = replay(own_history)
    expected = schedule(s, d, own_history[0][1], "Good", NOW)
    assert revision.stability == expected["stability"]
    assert revision.difficulty == expected["difficulty"]


def test_again_resets_streak_and_stays_due(session, user, topic):
    problem = make_problem(session, user, topic)
    revision = Revision(user_id=user.id, problem_id=problem.id)
    session.add(revision)

    grade_revision(session, revision, "Good", NOW)
    grade_revision(session, revision, "Again", NOW + timedelta(days=2))
    session.commit()

    assert revision.repetitions == 0
    assert revision.interval_days == 0
    assert revision.due_at == NOW + timedelta(days=2)
