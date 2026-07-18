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
from app.validation import MAX_PASSWORD

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


def test_register_race_loser_gets_409_not_500(client, monkeypatch):
    """Regression: the pre-insert uniqueness check is advisory — two concurrent
    signups for one address both pass it and only the unique index on
    user.email arbitrates. Standing in for the loser by disabling the check
    drives the request onto the IntegrityError path, which has to report the
    same 409 the check would rather than surfacing a driver error as a 500."""
    from app.routers import auth as auth_module

    assert register(client).status_code == 201
    client.cookies.clear()
    monkeypatch.setattr(auth_module, "_email_taken", lambda session, email: False)

    res = register(client, name="racing_wizard")  # same email, unique name
    assert res.status_code == 409
    assert res.json()["detail"] == "Email already in use"


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


def test_login_over_length_password_is_indistinguishable_from_a_bad_one(client):
    """Regression: the password cap is enforced at login by truncating the
    Argon2 input, never by answering early. A "too long" 400 — or any faster or
    differently-worded reply — would be a free oracle telling an attacker their
    guess was rejected on shape rather than on the credential."""
    register(client)
    client.cookies.clear()

    def attempt(password):
        return client.post(
            "/api/auth/login",
            json={"identifier": "wiz@example.com", "password": password, "remember": False},
        )

    wrong_pw = attempt("not-the-password")
    oversized = attempt("x" * (MAX_PASSWORD + 1))
    giant = attempt("x" * 100_000)  # bounded hashing work, not a 413/500

    assert wrong_pw.status_code == oversized.status_code == giant.status_code == 401
    assert wrong_pw.json() == oversized.json() == giant.json()
    assert "set-cookie" not in oversized.headers


def test_login_truncation_does_not_accept_a_longer_password(client):
    """The other half of the cap: truncating must not turn a max-length
    password into a prefix match that any longer string satisfies."""
    exact = "p" * MAX_PASSWORD
    assert register(
        client, name="capped_user", email="capped@example.com", password=exact
    ).status_code == 201
    client.cookies.clear()

    def attempt(password):
        return client.post(
            "/api/auth/login",
            json={"identifier": "capped@example.com", "password": password, "remember": False},
        )

    assert attempt(exact).status_code == 200
    client.cookies.clear()
    assert attempt(exact + "EXTRA").status_code == 401


def test_register_reports_the_password_cap_but_login_does_not(client):
    """Registration is a form you are filling in, so it names the rule; login
    is an unauthenticated guess, so it says nothing. The asymmetry is
    deliberate — pin it so a later "consistency" cleanup can't collapse them."""
    too_long = register(client, password="x" * (MAX_PASSWORD + 1))
    assert too_long.status_code == 400
    assert str(MAX_PASSWORD) in too_long.json()["detail"]

    client.cookies.clear()
    at_login = client.post(
        "/api/auth/login",
        json={"identifier": "wiz@example.com", "password": "x" * (MAX_PASSWORD + 1), "remember": False},
    )
    assert at_login.status_code == 401
    assert at_login.json()["detail"] == "Invalid email or password"


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


def test_update_me_rejects_blank_and_null_identifiers(client):
    """Regression: update_me branched on truthiness (``if data.get("email")``),
    so a present-but-empty identifier skipped validation entirely and was then
    written to the row by the generic setattr loop.

    The blank guard runs before the format validators, so whitespace reports
    "can't be empty" rather than "doesn't look right" — the value never reaches
    normalize_email/validate_name."""
    register(client)

    for blank in ("", "   ", None):
        email_res = client.patch("/api/users/me", json={"email": blank})
        assert email_res.status_code == 400, blank
        assert email_res.json()["detail"] == "Your email can't be empty."

        name_res = client.patch("/api/users/me", json={"name": blank})
        assert name_res.status_code == 400, blank
        assert name_res.json()["detail"] == "Your username can't be empty."

    me = client.get("/api/users/me").json()
    assert me["name"] == REGISTER["name"]  # nothing was committed
    assert me["email"] == REGISTER["email"]


def test_update_me_still_leaves_omitted_identifiers_alone(client):
    """The guard keys off key *presence*, so PATCH stays sparse: omitting name
    and email must still mean "leave them alone", not "clear them"."""
    register(client)

    res = client.patch("/api/users/me", json={"bio": "learning graphs"})
    assert res.status_code == 200
    assert res.json()["bio"] == "learning graphs"
    assert res.json()["name"] == REGISTER["name"]
    assert res.json()["email"] == REGISTER["email"]


def test_blank_username_never_becomes_a_login_identifier(client):
    """The vulnerability the 400 above exists to prevent, end to end: with an
    empty name stored, ``{"identifier": ""}`` matched that row and logged in."""
    register(client)
    assert client.patch("/api/users/me", json={"name": ""}).status_code == 400
    assert client.patch("/api/users/me", json={"email": ""}).status_code == 400
    client.cookies.clear()

    for identifier in ("", "   "):
        res = client.post(
            "/api/auth/login",
            json={"identifier": identifier, "password": REGISTER["password"], "remember": False},
        )
        assert res.status_code == 401, identifier
        assert not client.cookies.get(SESSION_COOKIE)


def test_blank_identifier_cannot_log_in_a_pre_guard_blank_name_row(client, api_engine):
    """The case the *read*-path guard exists for, and the one that returned 200.

    The PATCH guard above only closes the write path. A row that acquired a
    blank name before that guard shipped is still matched by login's
    ``func.lower(User.name) == ""`` lookup, and its password_hash verifies
    normally — so ``{"identifier": ""}`` plus that account's real password was a
    working login for a row nobody can name. Seeded directly because the API can
    no longer produce one.
    """
    from app.security import hash_password

    with Session(api_engine) as s:
        s.add(
            User(
                name="",  # pre-guard damage
                email="blank@example.com",
                password_hash=hash_password(REGISTER["password"]),
            )
        )
        s.commit()

    wrong_pw = client.post(
        "/api/auth/login",
        json={"identifier": "blank@example.com", "password": "nope-nope-nope", "remember": False},
    )
    assert wrong_pw.status_code == 401

    for identifier in ("", "   ", "\t\n"):
        res = client.post(
            "/api/auth/login",
            json={"identifier": identifier, "password": REGISTER["password"], "remember": False},
        )
        assert res.status_code == 401, identifier
        # Byte-identical to a wrong password: the sameness *is* the fix, since a
        # distinct "blank identifier" reply would re-open the enumeration oracle.
        assert res.json() == wrong_pw.json(), identifier
        assert "set-cookie" not in res.headers, identifier
        assert not client.cookies.get(SESSION_COOKIE), identifier

    # The guard refuses the blank *identifier*, not the row: the same account
    # still logs in by the email it does have.
    by_email = client.post(
        "/api/auth/login",
        json={"identifier": "blank@example.com", "password": REGISTER["password"], "remember": False},
    )
    assert by_email.status_code == 200
    assert by_email.json()["email"] == "blank@example.com"


# --- PATCH /api/users/me: null into a NOT NULL column ----------------------------


def test_update_me_rejects_null_for_non_nullable_columns(client):
    """Regression: UserUpdate types every field ``| None`` so PATCH stays
    sparse, but ``timezone`` and ``daily_goal`` have *defaults*, not
    nullability. An explicit null fell through to the setattr loop and only
    surfaced at commit as a driver IntegrityError — a 500 any authenticated
    user could trigger with one request."""
    register(client)

    for wire_name in ("timezone", "dailyGoal"):
        res = client.patch("/api/users/me", json={wire_name: None})
        assert res.status_code == 400, wire_name
        assert res.json()["detail"] == f"Your {wire_name} can't be null."

    # populate_by_name accepts the snake_case field name too; the message still
    # names the camelCase key the wire contract documents.
    res = client.patch("/api/users/me", json={"daily_goal": None})
    assert res.status_code == 400
    assert res.json()["detail"] == "Your dailyGoal can't be null."

    me = client.get("/api/users/me").json()
    assert me["timezone"] == "UTC" and me["dailyGoal"] == 10  # nothing committed


def test_update_me_null_identifiers_keep_their_own_wording(client):
    """``name`` is non-nullable too, so it is in the derived set — but the
    identity block runs first and owns the more specific message. Pinned
    because reordering the guards would silently reword a documented error."""
    register(client)

    res = client.patch("/api/users/me", json={"name": None})
    assert res.status_code == 400
    assert res.json()["detail"] == "Your username can't be empty."


def test_update_me_still_accepts_null_for_nullable_columns(client):
    """The other half: on a genuinely nullable column, null means "clear this"
    and must keep working. A blanket "no nulls" rule would take that away."""
    register(client)
    assert client.patch("/api/users/me", json={"bio": "learning graphs"}).status_code == 200

    res = client.patch("/api/users/me", json={"bio": None, "leetcodeUsername": None})
    assert res.status_code == 200
    assert res.json()["bio"] is None
    assert res.json()["leetcodeUsername"] is None


def test_update_me_writes_non_nullable_fields_and_leaves_omitted_ones(client):
    """Non-vacuity: the guard rejects null specifically, not the keys. And PATCH
    is still sparse — omitting them must not reset them to their defaults."""
    register(client)

    res = client.patch("/api/users/me", json={"timezone": "Asia/Kolkata", "dailyGoal": 25})
    assert res.status_code == 200
    assert res.json()["timezone"] == "Asia/Kolkata"
    assert res.json()["dailyGoal"] == 25

    res = client.patch("/api/users/me", json={"bio": "unrelated edit"})
    assert res.status_code == 200
    assert res.json()["timezone"] == "Asia/Kolkata"
    assert res.json()["dailyGoal"] == 25


# --- removed legacy surface ------------------------------------------------------


def test_legacy_user_endpoints_are_gone(client):
    # X-User-Id was the old trust-the-client identity; it must be inert now.
    res = client.get("/api/users/me", headers={"X-User-Id": "someone"})
    assert res.status_code == 401
    assert client.get("/api/users").status_code in (404, 405)
    assert client.post("/api/users", json={"name": "x"}).status_code in (404, 405)
