"""API tests for the email/password auth cycle (AUTH_DESIGN.md test plan):
register → login → /me → logout, expired sessions, wrong password, duplicate
email, allow_registration=false, and rate limiting.
"""

from datetime import timedelta

from sqlmodel import Session, select

from app.config import settings
from app.deps import SESSION_COOKIE
from app.models import AuthSession, TemplatePattern, User
from app.utils import utcnow

REGISTER = {"name": "algo_wizard", "email": "wiz@example.com", "password": "hunter2hunter2"}


def register(client, **overrides):
    return client.post("/api/auth/register", json={**REGISTER, **overrides})


# --- register ----------------------------------------------------------------


def test_register_creates_account_session_and_starter_library(client, api_engine):
    res = register(client)
    assert res.status_code == 201

    body = res.json()
    assert body["name"] == "algo_wizard"
    assert body["email"] == "wiz@example.com"
    assert "password" not in res.text and "passwordHash" not in body

    # The same response set the session cookie → /me works immediately.
    assert client.cookies.get(SESSION_COOKIE)
    me = client.get("/api/users/me")
    assert me.status_code == 200
    assert me.json()["id"] == body["id"]

    with Session(api_engine) as s:
        user = s.get(User, body["id"])
        assert user.password_hash and user.password_hash != REGISTER["password"]
        # register supersedes POST /api/users, including its starter seeding
        assert s.exec(
            select(TemplatePattern).where(TemplatePattern.user_id == user.id)
        ).first() is not None


def test_register_duplicate_email_409_case_insensitive(client):
    assert register(client).status_code == 201
    res = register(client, name="someone_else", email="WIZ@example.com")
    assert res.status_code == 409


def test_register_duplicate_username_409(client):
    assert register(client).status_code == 201
    res = register(client, email="other@example.com")
    assert res.status_code == 409


def test_register_rejects_bad_email_and_short_password(client):
    assert register(client, email="not-an-email").status_code == 400
    assert register(client, password="short").status_code == 400
    assert register(client, name="has@sign").status_code == 400


def test_register_disabled(client, monkeypatch):
    monkeypatch.setattr(settings, "allow_registration", False)
    assert register(client).status_code == 403


# --- login -------------------------------------------------------------------


def test_login_by_email_and_by_username(client):
    register(client)
    client.cookies.clear()

    res = client.post(
        "/api/auth/login",
        json={"identifier": "Wiz@Example.com", "password": REGISTER["password"], "remember": False},
    )
    assert res.status_code == 200
    assert res.json()["name"] == "algo_wizard"

    client.cookies.clear()
    res = client.post(
        "/api/auth/login",
        json={"identifier": "Algo_Wizard", "password": REGISTER["password"], "remember": False},
    )
    assert res.status_code == 200


def test_login_failures_are_vague_401(client):
    register(client)
    client.cookies.clear()

    wrong_pw = client.post(
        "/api/auth/login",
        json={"identifier": "wiz@example.com", "password": "not-the-password", "remember": False},
    )
    no_user = client.post(
        "/api/auth/login",
        json={"identifier": "ghost@example.com", "password": "whatever-123", "remember": False},
    )
    assert wrong_pw.status_code == no_user.status_code == 401
    # user enumeration: both failures read identically
    assert wrong_pw.json()["detail"] == no_user.json()["detail"]


def test_remember_controls_cookie_persistence(client):
    register(client)
    client.cookies.clear()

    persistent = client.post(
        "/api/auth/login",
        json={"identifier": "wiz@example.com", "password": REGISTER["password"], "remember": True},
    )
    assert "Max-Age" in persistent.headers["set-cookie"]

    client.cookies.clear()
    session_scoped = client.post(
        "/api/auth/login",
        json={"identifier": "wiz@example.com", "password": REGISTER["password"], "remember": False},
    )
    assert "Max-Age" not in session_scoped.headers["set-cookie"]
    for fragment in ("HttpOnly", "SameSite=lax", "Path=/"):
        assert fragment.lower() in session_scoped.headers["set-cookie"].lower()


# --- session lifecycle ---------------------------------------------------------


def test_me_requires_session(client):
    assert client.get("/api/users/me").status_code == 401


def test_logout_revokes_server_side(client, api_engine):
    register(client)
    token_cookie = client.cookies.get(SESSION_COOKIE)
    assert token_cookie

    res = client.post("/api/auth/logout")
    assert res.status_code == 204

    # Even replaying the old cookie value fails: the row is gone.
    client.cookies.set(SESSION_COOKIE, token_cookie)
    assert client.get("/api/users/me").status_code == 401
    with Session(api_engine) as s:
        assert s.exec(select(AuthSession)).all() == []


def test_expired_session_is_rejected_and_purged(client, api_engine):
    register(client)
    with Session(api_engine) as s:
        row = s.exec(select(AuthSession)).one()
        row.expires_at = utcnow() - timedelta(minutes=1)
        s.add(row)
        s.commit()

    assert client.get("/api/users/me").status_code == 401
    with Session(api_engine) as s:
        assert s.exec(select(AuthSession)).all() == []


def test_sliding_expiry_renews_on_use(client, api_engine):
    register(client)
    with Session(api_engine) as s:
        row = s.exec(select(AuthSession)).one()
        original_expiry = row.expires_at - timedelta(days=10)
        row.expires_at = original_expiry
        row.last_used_at = utcnow() - timedelta(hours=2)  # past the throttle
        s.add(row)
        s.commit()

    assert client.get("/api/users/me").status_code == 200
    with Session(api_engine) as s:
        renewed = s.exec(select(AuthSession)).one()
        assert renewed.expires_at > original_expiry


def test_login_purges_other_expired_sessions(client, api_engine):
    register(client)
    with Session(api_engine) as s:
        user = s.exec(select(User)).one()
        s.add(
            AuthSession(
                token_hash="dead-session",
                user_id=user.id,
                expires_at=utcnow() - timedelta(days=1),
            )
        )
        s.commit()

    client.cookies.clear()
    res = client.post(
        "/api/auth/login",
        json={"identifier": "wiz@example.com", "password": REGISTER["password"], "remember": False},
    )
    assert res.status_code == 200
    with Session(api_engine) as s:
        hashes = [r.token_hash for r in s.exec(select(AuthSession)).all()]
        assert "dead-session" not in hashes


# --- rate limiting -------------------------------------------------------------


def test_login_rate_limited(client):
    payload = {"identifier": "ghost@example.com", "password": "wrong-password", "remember": False}
    statuses = [
        client.post("/api/auth/login", json=payload).status_code for _ in range(11)
    ]
    assert statuses[:10] == [401] * 10
    assert statuses[10] == 429


def test_register_rate_limited(client):
    statuses = [
        register(client, name=f"user{i}", email=f"u{i}@example.com").status_code
        for i in range(6)
    ]
    assert statuses[:5] == [201] * 5
    assert statuses[5] == 429


def test_login_by_ambiguous_username_rejected(client, api_engine):
    """Pre-auth installs can hold duplicate names (the old POST /api/users had
    no uniqueness check). Username login must refuse to guess between them —
    each account still logs in by its email."""
    from app.security import hash_password

    register(client)
    with Session(api_engine) as s:
        s.add(
            User(
                name="Algo_Wizard",  # case-variant duplicate of the registered name
                email="dup@example.com",
                password_hash=hash_password(REGISTER["password"]),
            )
        )
        s.commit()
    client.cookies.clear()

    ambiguous = client.post(
        "/api/auth/login",
        json={"identifier": "algo_wizard", "password": REGISTER["password"], "remember": False},
    )
    assert ambiguous.status_code == 401

    by_email = client.post(
        "/api/auth/login",
        json={"identifier": "wiz@example.com", "password": REGISTER["password"], "remember": False},
    )
    assert by_email.status_code == 200
    assert by_email.json()["email"] == "wiz@example.com"


# --- PATCH /api/users/me identity invariants -------------------------------------


def test_update_me_rejects_case_variant_duplicate_email(client):
    register(client)
    client.cookies.clear()
    register(client, name="second_user", email="second@example.com")

    res = client.patch("/api/users/me", json={"email": "WIZ@example.com"})
    assert res.status_code == 409


def test_update_me_normalizes_email_and_allows_own(client):
    register(client)

    # Re-submitting your own address in different case is not a clash…
    res = client.patch("/api/users/me", json={"email": "WIZ@Example.com"})
    assert res.status_code == 200
    assert res.json()["email"] == "wiz@example.com"  # …and stores normalized

    assert client.patch("/api/users/me", json={"email": "not-an-email"}).status_code == 400


def test_update_me_enforces_username_rules(client):
    register(client)
    client.cookies.clear()
    register(client, name="second_user", email="second@example.com")

    assert client.patch("/api/users/me", json={"name": "ALGO_wizard"}).status_code == 409
    assert client.patch("/api/users/me", json={"name": "bad@name"}).status_code == 400
    # Changing the case of your own name is allowed.
    res = client.patch("/api/users/me", json={"name": "Second_User"})
    assert res.status_code == 200
    assert res.json()["name"] == "Second_User"


# --- removed legacy surface ------------------------------------------------------


def test_legacy_user_endpoints_are_gone(client):
    # X-User-Id was the old trust-the-client identity; it must be inert now.
    res = client.get("/api/users/me", headers={"X-User-Id": "someone"})
    assert res.status_code == 401
    assert client.get("/api/users").status_code in (404, 405)
    assert client.post("/api/users", json={"name": "x"}).status_code in (404, 405)
