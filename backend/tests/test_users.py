"""User profiles over HTTP: create (with starter-template seeding), list, /me, patch.

Header resolution errors (missing/unknown X-User-Id) live in test_app.py.
"""

from datetime import datetime

from sqlmodel import select

from app.models import TemplatePattern, User
from app.seed import STARTER_PATTERNS


def post_user(client, name="Ada", **fields):
    return client.post("/api/users", json={"name": name, **fields})


def iso(ts):
    return datetime.fromisoformat(ts.rstrip("Z"))


def add_user(session, name, **fields):
    u = User(name=name, **fields)
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


# --- POST /api/users ---------------------------------------------------------


def test_create_user_returns_full_camelcase_profile(client, session):
    res = post_user(
        client,
        name="Ada",
        email="ada@example.com",
        timezone="Asia/Kolkata",
        dailyGoal=25,
        bio="Loves invariants",
    )

    assert res.status_code == 201
    body = res.json()
    assert body["name"] == "Ada"
    assert body["email"] == "ada@example.com"
    assert body["timezone"] == "Asia/Kolkata"
    assert body["dailyGoal"] == 25
    assert body["bio"] == "Loves invariants"
    assert body["createdAt"].endswith("Z")
    assert body["updatedAt"].endswith("Z")

    persisted = session.get(User, body["id"])
    assert persisted is not None
    assert persisted.daily_goal == 25
    assert persisted.email == "ada@example.com"


def test_create_user_applies_defaults(client):
    res = post_user(client, name="Min")

    assert res.status_code == 201
    body = res.json()
    assert body["email"] is None
    assert body["timezone"] == "UTC"
    assert body["dailyGoal"] == 10
    assert body["bio"] is None


def test_create_user_seeds_starter_template_library(client, session, user):
    new_id = post_user(client, name="Fresh").json()["id"]

    patterns = session.exec(
        select(TemplatePattern)
        .where(TemplatePattern.user_id == new_id)
        .order_by(TemplatePattern.position)
    ).all()

    # Guard against a vacuous [] == [] pass should the starter set ever empty.
    assert patterns
    assert [p.name for p in patterns] == [p["name"] for p in STARTER_PATTERNS]
    assert [p.position for p in patterns] == list(range(len(STARTER_PATTERNS)))
    assert [len(p.variations) for p in patterns] == [
        len(p["variations"]) for p in STARTER_PATTERNS
    ]

    # Seeding is scoped to the new profile; the fixture user (created directly
    # in the DB) has no library.
    fixture_patterns = session.exec(
        select(TemplatePattern).where(TemplatePattern.user_id == user.id)
    ).all()
    assert fixture_patterns == []


def test_create_user_duplicate_email_conflicts(client, session):
    assert post_user(client, name="First", email="dup@example.com").status_code == 201
    before = len(session.exec(select(User)).all())

    res = post_user(client, name="Second", email="dup@example.com")

    assert res.status_code == 409
    assert res.json()["detail"] == "Email already in use"
    assert len(session.exec(select(User)).all()) == before


def test_create_users_without_email_do_not_conflict(client):
    first = post_user(client, name="Anon One")
    second = post_user(client, name="Anon Two")

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]


# --- GET /api/users ----------------------------------------------------------


def test_list_users_returns_all_profiles_in_creation_order(client, session, user):
    # The fixture user was created "now"; these two predate it.
    oldest = add_user(session, "Oldest", created_at=datetime(2020, 1, 1))
    middle = add_user(session, "Middle", created_at=datetime(2023, 6, 15))

    rows = client.get("/api/users").json()

    assert [r["id"] for r in rows] == [oldest.id, middle.id, user.id]
    assert [r["name"] for r in rows] == ["Oldest", "Middle", "Test User"]


# --- GET /api/users/me -------------------------------------------------------


def test_get_me_returns_serialized_profile(client, user):
    res = client.get("/api/users/me")

    assert res.status_code == 200
    body = res.json()
    assert body == {
        "id": user.id,
        "name": "Test User",
        "email": None,
        "timezone": "UTC",
        "dailyGoal": 10,
        "bio": None,
        "leetcodeUsername": None,
        "createdAt": user.created_at.isoformat() + "Z",
        "updatedAt": user.updated_at.isoformat() + "Z",
    }


# --- PATCH /api/users/me -----------------------------------------------------


def test_patch_partial_update_keeps_untouched_fields(client, session, user):
    res = client.patch("/api/users/me", json={"dailyGoal": 3})

    assert res.status_code == 200
    body = res.json()
    assert body["dailyGoal"] == 3
    # Fields absent from the payload survive (exclude_unset).
    assert body["name"] == "Test User"
    assert body["timezone"] == "UTC"
    assert body["email"] is None
    assert body["bio"] is None

    session.refresh(user)
    assert user.daily_goal == 3
    assert user.name == "Test User"


def test_patch_explicit_null_clears_optional_field(client, session, user):
    user.bio = "old bio"
    session.add(user)
    session.commit()

    body = client.patch("/api/users/me", json={"bio": None}).json()

    assert body["bio"] is None
    session.refresh(user)
    assert user.bio is None


def test_patch_email_clash_with_other_user_is_409(client, session, user):
    add_user(session, "Other", email="taken@example.com")

    res = client.patch("/api/users/me", json={"email": "taken@example.com"})

    assert res.status_code == 409
    assert res.json()["detail"] == "Email already in use"
    session.refresh(user)
    assert user.email is None


def test_patch_changing_to_unused_email_succeeds(client, session, user):
    add_user(session, "Other", email="taken@example.com")

    res = client.patch("/api/users/me", json={"email": "fresh@example.com"})

    assert res.status_code == 200
    assert res.json()["email"] == "fresh@example.com"
    session.refresh(user)
    assert user.email == "fresh@example.com"


def test_patch_keeping_same_email_is_allowed(client, session, user):
    user.email = "mine@example.com"
    session.add(user)
    session.commit()

    res = client.patch(
        "/api/users/me", json={"email": "mine@example.com", "name": "Still Me"}
    )

    assert res.status_code == 200
    assert res.json()["email"] == "mine@example.com"
    assert res.json()["name"] == "Still Me"


def test_patch_moves_updated_at_forward(client, session, user):
    past = datetime(2020, 1, 1, 12, 0, 0)
    user.updated_at = past
    session.add(user)
    session.commit()

    body = client.patch("/api/users/me", json={"name": "Renamed"}).json()

    assert iso(body["updatedAt"]) > past
    assert iso(body["updatedAt"]) >= iso(body["createdAt"])
