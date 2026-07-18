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


# --- HTTP level ---
#
# The tests above call list_leetcode_questions directly, passing `user` as a
# plain argument. That verifies the ownership rule but NOT that the endpoint
# actually resolves a user: deleting the Depends(get_current_user_optional)
# from the signature leaves every one of them passing while the leak returns.
# These drive the real app so the dependency wiring itself is under test.


@pytest.fixture
def api_session():
    """Separate from the ``session`` fixture: StaticPool keeps the single
    in-memory database alive across connections, which TestClient needs because
    it runs the endpoint on a worker thread. Without it the request thread
    opens a fresh, empty ``:memory:`` database ("no such table: user").
    """
    from sqlalchemy.pool import StaticPool
    from sqlmodel import Session, SQLModel, create_engine

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s
    engine.dispose()


@pytest.fixture
def api_user(api_session):
    u = User(name="Test User")
    api_session.add(u)
    api_session.commit()
    api_session.refresh(u)
    return u


@pytest.fixture
def api_other_user(api_session):
    u = User(name="Other User")
    api_session.add(u)
    api_session.commit()
    api_session.refresh(u)
    return u


@pytest.fixture
def client(api_session):
    from fastapi.testclient import TestClient

    from app import db
    from app.main import app

    # Deliberately not a context manager: entering TestClient runs the app
    # lifespan, and init_db() would touch the developer's real SQLite file.
    app.dependency_overrides[db.get_session] = lambda: api_session
    yield TestClient(app)
    app.dependency_overrides.clear()


def seed_private(session, owner):
    make_question(session, "1", "Two Sum")
    make_question(session, "2", "Add Two Numbers")
    return make_curriculum(
        session, "My Plan", "my-plan", user_id=owner.id, question_ids=["2"]
    )


def test_http_owner_may_filter_by_private_curriculum(client, api_session, api_user):
    session, user = api_session, api_user
    c = seed_private(session, user)

    res = client.get(
        "/api/leetcode-questions",
        params={"curriculum": c.slug},
        headers={"X-User-Id": user.id},
    )
    assert res.status_code == 200
    assert [x["id"] for x in res.json()["items"]] == ["2"]


def test_http_stranger_is_denied_private_curriculum(
    client, api_session, api_user, api_other_user
):
    session, user, other_user = api_session, api_user, api_other_user
    c = seed_private(session, user)

    res = client.get(
        "/api/leetcode-questions",
        params={"curriculum": c.slug},
        headers={"X-User-Id": other_user.id},
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "Access denied"


def test_http_anonymous_is_denied_private_curriculum(client, api_session, api_user):
    session, user = api_session, api_user
    c = seed_private(session, user)

    # No X-User-Id header at all — this is the request the leak allowed.
    res = client.get("/api/leetcode-questions", params={"curriculum": c.slug})
    assert res.status_code == 403


def test_http_anonymous_browsing_still_works(client, api_session, api_user):
    session, user = api_session, api_user
    seed_private(session, user)
    make_curriculum(session, "Blind 75", "blind-75", user_id=None, question_ids=["1"])

    # Catalog browsing stays public: unfiltered, and filtered by a global list.
    assert client.get("/api/leetcode-questions").status_code == 200

    res = client.get("/api/leetcode-questions", params={"curriculum": "blind-75"})
    assert res.status_code == 200
    assert [x["id"] for x in res.json()["items"]] == ["1"]


def test_http_unknown_user_id_is_rejected(client, api_session, api_user):
    session, user = api_session, api_user
    seed_private(session, user)

    # A header naming a nonexistent profile is an error, not silent anonymity.
    res = client.get(
        "/api/leetcode-questions", headers={"X-User-Id": "no-such-profile"}
    )
    assert res.status_code == 404


def test_http_empty_user_id_header_is_anonymous(client, api_session, api_user):
    session, user = api_session, api_user
    seed_private(session, user)

    # An empty header is absent, not a bogus id — public browsing still works.
    res = client.get("/api/leetcode-questions", headers={"X-User-Id": ""})
    assert res.status_code == 200
