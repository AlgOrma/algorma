import pytest
from fastapi import HTTPException

from app.models import Curriculum, CurriculumQuestionLink, LeetCodeQuestion, User
from app.routers.leetcode_questions import list_leetcode_questions


def make_question(session, id, title, difficulty="Easy"):
    q = LeetCodeQuestion(
        id=id,
        question_id=id,
        title=title,
        difficulty=difficulty,
        leetcode_url=f"https://leetcode.com/problems/{id}/",
    )
    session.add(q)
    session.commit()
    session.refresh(q)
    return q


def make_curriculum(session, name, slug, user_id=None, question_ids=()):
    c = Curriculum(name=name, slug=slug, user_id=user_id)
    session.add(c)
    session.commit()
    session.refresh(c)
    for q_id in question_ids:
        session.add(CurriculumQuestionLink(curriculum_id=c.id, leetcode_id=q_id))
    session.commit()
    return c


@pytest.fixture
def other_user(session):
    u = User(name="Other User")
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


def list_questions(session, user=None, **kwargs):
    kwargs.setdefault("page", 1)
    kwargs.setdefault("limit", 50)
    return list_leetcode_questions(session=session, user=user, **kwargs)


def test_global_curriculum_filter_readable_by_anyone(session, user):
    make_question(session, "1", "Two Sum")
    make_question(session, "2", "Add Two Numbers")
    make_curriculum(session, "Blind 75", "blind-75", user_id=None, question_ids=["1"])

    # Anonymous request (no X-User-Id) can filter by a global curriculum.
    res = list_questions(session, user=None, curriculum="blind-75")
    assert [x["id"] for x in res["items"]] == ["1"]

    # So can any signed-in user.
    res = list_questions(session, user=user, curriculum="blind-75")
    assert [x["id"] for x in res["items"]] == ["1"]


def test_private_curriculum_filter_by_owner(session, user):
    make_question(session, "1", "Two Sum")
    make_question(session, "2", "Add Two Numbers")
    c = make_curriculum(
        session, "My Plan", "my-plan", user_id=user.id, question_ids=["2"]
    )

    res = list_questions(session, user=user, curriculum=c.slug)
    assert [x["id"] for x in res["items"]] == ["2"]

    # Filtering by id works the same as by slug.
    res = list_questions(session, user=user, curriculum=c.id)
    assert [x["id"] for x in res["items"]] == ["2"]


def test_private_curriculum_filter_denied_for_non_owner(session, user, other_user):
    make_question(session, "1", "Two Sum")
    c = make_curriculum(
        session, "My Plan", "my-plan", user_id=user.id, question_ids=["1"]
    )

    # Same rule as GET /api/curriculums/{id_or_slug}: another user's private
    # curriculum must not be usable as a filter — its membership is private.
    with pytest.raises(HTTPException) as exc:
        list_questions(session, user=other_user, curriculum=c.slug)
    assert exc.value.status_code == 403

    with pytest.raises(HTTPException) as exc:
        list_questions(session, user=other_user, curriculum=c.id)
    assert exc.value.status_code == 403


def test_private_curriculum_filter_denied_for_anonymous(session, user):
    make_question(session, "1", "Two Sum")
    c = make_curriculum(
        session, "My Plan", "my-plan", user_id=user.id, question_ids=["1"]
    )

    with pytest.raises(HTTPException) as exc:
        list_questions(session, user=None, curriculum=c.slug)
    assert exc.value.status_code == 403


def test_unknown_curriculum_filter_is_ignored(session, user):
    make_question(session, "1", "Two Sum")
    make_question(session, "2", "Add Two Numbers")

    # Pre-existing behavior: a curriculum that doesn't exist silently skips the
    # filter rather than erroring.
    res = list_questions(session, user=user, curriculum="no-such-plan")
    assert [x["id"] for x in res["items"]] == ["1", "2"]
