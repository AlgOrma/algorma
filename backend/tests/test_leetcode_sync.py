"""Tests for POST /api/leetcode/sync — the LeetCode client is monkeypatched,
so no network is involved."""

import pytest
from fastapi import HTTPException
from sqlmodel import select

from app.leetcode_client import LeetCodeAuthError
from app.models import LeetCodeQuestion, Problem, Revision
from app.routers.leetcode_sync import sync_solved_problems
from app.schemas import LeetCodeSyncRequest


@pytest.fixture
def catalog(session):
    questions = [
        LeetCodeQuestion(
            id="1",
            question_id="1",
            title="Two Sum",
            difficulty="Easy",
            statement="<p>Find two numbers…</p>",
            leetcode_url="https://leetcode.com/problems/two-sum/",
            topic_tags='["Array", "Hash Table"]',
        ),
        LeetCodeQuestion(
            id="20",
            question_id="20",
            title="Valid Parentheses",
            difficulty="Easy",
            statement="<p>Given a string…</p>",
            leetcode_url="https://leetcode.com/problems/valid-parentheses/",
            topic_tags='["String", "Stack"]',
        ),
        LeetCodeQuestion(
            id="200",
            question_id="200",
            title="Number of Islands",
            difficulty="Medium",
            statement="<p>Given a grid…</p>",
            leetcode_url="https://leetcode.com/problems/number-of-islands/",
            topic_tags='["Graph"]',
        ),
    ]
    session.add_all(questions)
    session.commit()
    return questions


def _sync(session, user, **payload):
    return sync_solved_problems(
        payload=LeetCodeSyncRequest(**payload), user=user, session=session
    )


def test_requires_username_or_cookie(session, user):
    with pytest.raises(HTTPException) as exc:
        _sync(session, user)
    assert exc.value.status_code == 400


def test_full_sync_imports_solved_as_done(session, user, catalog, monkeypatch):
    monkeypatch.setattr(
        "app.leetcode_client.fetch_solved_full",
        lambda cookie: (
            "lc_user",
            [
                {"frontend_id": "1", "slug": "two-sum", "solved_at": None},
                {"frontend_id": "20", "slug": "valid-parentheses", "solved_at": None},
            ],
        ),
    )

    res = _sync(session, user, session_cookie="abc123")

    assert res["mode"] == "full"
    assert res["username"] == "lc_user"
    assert res["totalSolved"] == 2
    assert res["imported"] == 2
    assert res["markedDone"] == 0
    assert res["unmatched"] == []

    problems = session.exec(select(Problem).where(Problem.user_id == user.id)).all()
    assert {p.title for p in problems} == {"1. Two Sum", "20. Valid Parentheses"}
    assert all(p.status == "Done" for p in problems)
    assert all(p.solved_at is not None for p in problems)
    assert all(p.leetcode_id for p in problems)

    # Each import gets a Revision, like the one-click catalog import.
    revisions = session.exec(select(Revision).where(Revision.user_id == user.id)).all()
    assert {r.problem_id for r in revisions} == {p.id for p in problems}
    assert all(r.interval_days == 6 for r in revisions)

    # The resolved username is remembered on the profile; the cookie is not.
    session.refresh(user)
    assert user.leetcode_username == "lc_user"


def test_sync_marks_existing_problem_done(session, user, topic, catalog, monkeypatch):
    existing = Problem(
        user_id=user.id,
        title="1. Two Sum",
        topic_id=topic.id,
        difficulty="Easy",
        status="Solving",
        leetcode_url="https://leetcode.com/problems/two-sum/",
        leetcode_id="1",
    )
    session.add(existing)
    session.commit()

    monkeypatch.setattr(
        "app.leetcode_client.fetch_solved_full",
        lambda cookie: (
            "lc_user",
            [{"frontend_id": "1", "slug": "two-sum", "solved_at": None}],
        ),
    )

    res = _sync(session, user, session_cookie="abc123")
    assert res["imported"] == 0
    assert res["markedDone"] == 1

    session.refresh(existing)
    assert existing.status == "Done"
    assert existing.solved_at is not None


def test_sync_is_idempotent(session, user, catalog, monkeypatch):
    monkeypatch.setattr(
        "app.leetcode_client.fetch_solved_full",
        lambda cookie: (
            "lc_user",
            [{"frontend_id": "1", "slug": "two-sum", "solved_at": None}],
        ),
    )

    first = _sync(session, user, session_cookie="abc123")
    second = _sync(session, user, session_cookie="abc123")

    assert first["imported"] == 1
    assert second["imported"] == 0
    assert second["markedDone"] == 0
    assert second["alreadyDone"] == 1
    problems = session.exec(select(Problem).where(Problem.user_id == user.id)).all()
    assert len(problems) == 1


def test_recent_sync_by_username_matches_slugs(session, user, catalog, monkeypatch):
    monkeypatch.setattr(
        "app.leetcode_client.fetch_recent_accepted",
        lambda username, limit=100: [
            {"frontend_id": None, "slug": "number-of-islands", "solved_at": "1750000000"},
            {"frontend_id": None, "slug": "not-in-catalog", "solved_at": "1750000000"},
        ],
    )

    res = _sync(session, user, username="lc_user")

    assert res["mode"] == "recent"
    assert res["imported"] == 1
    assert res["unmatched"] == ["not-in-catalog"]

    problem = session.exec(select(Problem).where(Problem.user_id == user.id)).one()
    assert problem.title == "200. Number of Islands"
    # solved_at comes from the submission timestamp, not the sync time.
    assert problem.solved_at.year == 2025


def test_invalid_cookie_maps_to_401(session, user, catalog, monkeypatch):
    def boom(cookie):
        raise LeetCodeAuthError("bad cookie")

    monkeypatch.setattr("app.leetcode_client.fetch_solved_full", boom)

    with pytest.raises(HTTPException) as exc:
        _sync(session, user, session_cookie="expired")
    assert exc.value.status_code == 401
