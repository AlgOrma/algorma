"""OAuth callback tests with the provider exchange stubbed out
(AUTH_DESIGN.md test plan: link-existing vs create-new paths).

``_fetch_identity`` is the seam: it wraps the entire Authlib network
round-trip, so stubbing it exercises everything else for real — provider
registration, linking rules, session creation, redirects. Because stubbing it
also means the callback tests never run the real thing, it gets its own unit
tests at the bottom of this file against a fake OAuth client: it is what
produces the ``email_verified`` signal the whole linking rule stands on, so a
silent regression there (a verified flag on an unverified address) would
disable the anti-takeover guard with every other test still green.
"""

import asyncio

import pytest
from sqlmodel import Session, select

from app.config import settings
from app.deps import SESSION_COOKIE
from app.models import OAuthAccount, User
from app.routers import auth as auth_module
from app.routers.auth import OAuthIdentity

GOOGLE_IDENTITY = OAuthIdentity(
    provider_account_id="google-sub-123",
    email="Wiz@Example.com",
    email_verified=True,
    name="Wiz Ard",
)


@pytest.fixture
def google_configured(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(settings, "google_client_secret", "test-client-secret")


def stub_identity(monkeypatch, identity):
    async def fake_fetch(provider, client, request):
        return identity

    monkeypatch.setattr(auth_module, "_fetch_identity", fake_fetch)


def callback(client):
    return client.get("/api/auth/google/callback?code=x&state=y", follow_redirects=False)


# --- providers listing ---------------------------------------------------------


def test_providers_empty_by_default(client):
    assert client.get("/api/auth/providers").json() == []


def test_providers_lists_configured(client, google_configured):
    assert client.get("/api/auth/providers").json() == ["google"]


def test_unconfigured_provider_redirects_with_error(client):
    res = client.get("/api/auth/google/authorize", follow_redirects=False)
    assert res.status_code == 307
    assert res.headers["location"].startswith(settings.frontend_url)
    assert "error=unknown_provider" in res.headers["location"]


# --- callback paths --------------------------------------------------------------


def test_callback_creates_new_user_and_session(client, api_engine, google_configured, monkeypatch):
    stub_identity(monkeypatch, GOOGLE_IDENTITY)

    res = callback(client)
    assert res.status_code == 307
    assert res.headers["location"] == settings.frontend_url
    assert SESSION_COOKIE in res.headers.get("set-cookie", "")

    with Session(api_engine) as s:
        user = s.exec(select(User)).one()
        assert user.email == "wiz@example.com"  # normalized to lowercase
        assert user.password_hash is None  # OAuth-only account
        account = s.exec(select(OAuthAccount)).one()
        assert account.provider == "google"
        assert account.provider_account_id == "google-sub-123"
        assert account.user_id == user.id

    # The cookie from the redirect is a working session.
    assert client.get("/api/users/me").status_code == 200


def test_callback_links_to_existing_user_by_verified_email(
    client, api_engine, google_configured, monkeypatch
):
    reg = client.post(
        "/api/auth/register",
        json={"name": "algo_wizard", "email": "wiz@example.com", "password": "hunter2hunter2"},
    )
    existing_id = reg.json()["id"]
    client.cookies.clear()

    stub_identity(monkeypatch, GOOGLE_IDENTITY)
    assert callback(client).status_code == 307

    with Session(api_engine) as s:
        assert len(s.exec(select(User)).all()) == 1  # linked, not duplicated
        assert s.exec(select(OAuthAccount)).one().user_id == existing_id


def test_callback_reuses_link_on_return_visits(client, api_engine, google_configured, monkeypatch):
    stub_identity(monkeypatch, GOOGLE_IDENTITY)
    assert callback(client).status_code == 307
    client.cookies.clear()
    assert callback(client).status_code == 307

    with Session(api_engine) as s:
        assert len(s.exec(select(User)).all()) == 1
        assert len(s.exec(select(OAuthAccount)).all()) == 1


def test_callback_rejects_unverified_email(client, api_engine, google_configured, monkeypatch):
    stub_identity(
        monkeypatch,
        OAuthIdentity(
            provider_account_id="google-sub-999",
            email="victim@example.com",
            email_verified=False,  # account-takeover guard
            name="Mallory",
        ),
    )
    res = callback(client)
    assert "error=email_unverified" in res.headers["location"]
    with Session(api_engine) as s:
        assert s.exec(select(User)).all() == []
        assert s.exec(select(OAuthAccount)).all() == []


def test_callback_rejects_verified_flag_without_an_email(
    client, api_engine, google_configured, monkeypatch
):
    """The linking gate requires both halves. A provider payload that says
    "verified" but carries no address must not fall through to matching on an
    empty email."""
    stub_identity(
        monkeypatch,
        OAuthIdentity(
            provider_account_id="google-sub-000",
            email=None,
            email_verified=True,
            name="Nameless",
        ),
    )
    res = callback(client)
    assert "error=email_unverified" in res.headers["location"]
    with Session(api_engine) as s:
        assert s.exec(select(User)).all() == []


def test_callback_respects_allow_registration(client, api_engine, google_configured, monkeypatch):
    monkeypatch.setattr(settings, "allow_registration", False)
    stub_identity(monkeypatch, GOOGLE_IDENTITY)

    res = callback(client)
    assert "error=registration_disabled" in res.headers["location"]
    with Session(api_engine) as s:
        assert s.exec(select(User)).all() == []


def test_callback_oauth_error_redirects_generic(client, google_configured, monkeypatch):
    from authlib.integrations.starlette_client import OAuthError

    async def boom(provider, client_, request):
        raise OAuthError(error="access_denied")

    monkeypatch.setattr(auth_module, "_fetch_identity", boom)
    res = callback(client)
    assert "error=oauth_failed" in res.headers["location"]


def test_oauth_username_collision_gets_suffix(client, api_engine, google_configured, monkeypatch):
    client.post(
        "/api/auth/register",
        json={"name": "Wiz Ard", "email": "other@example.com", "password": "hunter2hunter2"},
    )
    client.cookies.clear()

    stub_identity(monkeypatch, GOOGLE_IDENTITY)  # same display name, new email
    assert callback(client).status_code == 307

    with Session(api_engine) as s:
        names = {u.name for u in s.exec(select(User)).all()}
        assert "Wiz Ard" in names
        assert len(names) == 2  # the OAuth user got a de-duplicated name


# --- concurrent-callback races -----------------------------------------------------
#
# Both uniqueness checks in the callback are advisory reads: the user lookup by
# email and the OAuthAccount lookup by (provider, provider_account_id) can both
# come back empty and still lose to a concurrent callback before the INSERT
# lands. Only the unique indexes arbitrate, so each has a rollback-and-recover
# path — and this is the account-LINKING code, where getting recovery wrong
# means adopting the wrong account rather than merely erroring.
#
# The races below are real, not stubbed exceptions: `seed` commits the rival row
# on its own Session just before the request's own commit flushes, so SQLite's
# index raises the IntegrityError the handler catches.


def race_on_commit(session, seed):
    """Make ``session``'s next commit lose a unique-index race.

    ``seed`` runs first and commits the row a concurrent callback would have
    written, so the pending INSERT genuinely violates the index. Stubbing the
    exception instead would prove the ``except`` block runs but not that the
    database is in the state the recovery assumes.
    """
    original = session.commit
    fired = False

    def commit():
        nonlocal fired
        if not fired:
            fired = True
            seed()
        return original()

    session.commit = commit


@pytest.fixture
def racing_client(api_engine):
    """Builds a TestClient whose request session loses its first commit race."""
    from fastapi.testclient import TestClient

    from app.db import get_session
    from app.main import app
    from app.ratelimit import limiter

    def build(seed):
        def override():
            with Session(api_engine) as s:
                race_on_commit(s, seed)
                yield s

        app.dependency_overrides[get_session] = override
        limiter.reset()
        return TestClient(app)

    try:
        yield build
    finally:
        app.dependency_overrides.clear()


def seed_user(api_engine, **kwargs):
    with Session(api_engine) as s:
        user = User(**kwargs)
        s.add(user)
        s.commit()
        s.refresh(user)
        return user


def test_callback_losing_the_user_creation_race_adopts_the_winners_account(
    api_engine, google_configured, monkeypatch, racing_client
):
    """Losing this race is recoverable, unlike register's: the row the winner
    created is for the same provider-VERIFIED address, so it is this user's
    account. Adopting it — rather than erroring, or retrying the INSERT into a
    duplicate — is the whole point of the except block."""
    stub_identity(monkeypatch, GOOGLE_IDENTITY)

    def concurrent_callback():
        seed_user(api_engine, name="wiz_from_the_other_worker", email="wiz@example.com")

    client = racing_client(concurrent_callback)
    res = callback(client)
    assert res.status_code == 307
    assert res.headers["location"] == settings.frontend_url

    with Session(api_engine) as s:
        # One account, the winner's — not a duplicate, and not a 500.
        user = s.exec(select(User)).one()
        assert user.name == "wiz_from_the_other_worker"
        account = s.exec(select(OAuthAccount)).one()
        assert account.user_id == user.id

    # The session survived the rollback and identifies the adopted account.
    assert client.get("/api/users/me").json()["name"] == "wiz_from_the_other_worker"


def test_callback_losing_the_link_race_keeps_one_link_and_signs_in(
    api_engine, google_configured, monkeypatch, racing_client
):
    """The rival wrote the very link this request was about to write, so there
    is nothing left to do but sign the user in. The recovery re-reads the user
    through ``user_id`` captured before the rollback, because rollback expires
    the instance it was holding.

    Adopting that captured id is safe rather than a guess: both racers reached
    here from the same provider-verified address, and User.email is unique, so
    the rival's link necessarily points at this same account."""
    existing = seed_user(api_engine, name="algo_wizard", email="wiz@example.com")
    stub_identity(monkeypatch, GOOGLE_IDENTITY)

    def concurrent_callback():
        with Session(api_engine) as s:
            s.add(
                OAuthAccount(
                    provider="google",
                    provider_account_id=GOOGLE_IDENTITY.provider_account_id,
                    user_id=existing.id,
                )
            )
            s.commit()

    client = racing_client(concurrent_callback)
    res = callback(client)
    assert res.status_code == 307
    assert res.headers["location"] == settings.frontend_url
    assert SESSION_COOKIE in res.headers.get("set-cookie", "")

    with Session(api_engine) as s:
        assert len(s.exec(select(User)).all()) == 1
        account = s.exec(select(OAuthAccount)).one()  # not duplicated
        assert account.user_id == existing.id

    me = client.get("/api/users/me")
    assert me.status_code == 200
    assert me.json()["id"] == existing.id


# --- _fetch_identity: provider payload -> OAuthIdentity ---------------------------
#
# The tests above stub this function out, so these are its only coverage. Every
# case asserts BOTH halves of the result: an email is worthless without the
# verified flag that decides whether it may claim an existing account, and a
# verified flag is dangerous attached to the wrong address.


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload


class FakeOAuthClient:
    """Stands in for the Authlib client: an awaited token exchange plus awaited
    GETs served from a path -> payload map."""

    def __init__(self, token=None, responses=None):
        self.token = token if token is not None else {"access_token": "gho_x"}
        self.responses = responses or {}
        self.requested: list[str] = []

    async def authorize_access_token(self, request):
        return self.token

    async def get(self, url, token=None):
        self.requested.append(url)
        return FakeResponse(self.responses[url])


def fetch(provider, client):
    """_fetch_identity is async; the suite has no async plugin, so drive it
    directly rather than adding one for four call sites."""
    return asyncio.run(auth_module._fetch_identity(provider, client, request=None))


def github_client(profile, emails):
    return FakeOAuthClient(responses={"user": profile, "user/emails": emails})


# --- Google -----------------------------------------------------------------------


def test_google_identity_from_verified_userinfo():
    identity = fetch(
        "google",
        FakeOAuthClient(
            token={
                "userinfo": {
                    "sub": "google-sub-123",
                    "email": "Wiz@Example.com",
                    "email_verified": True,
                    "name": "Wiz Ard",
                }
            }
        ),
    )
    assert identity.provider_account_id == "google-sub-123"
    assert identity.email == "Wiz@Example.com"  # the callback does the lowercasing
    assert identity.email_verified is True
    assert identity.name == "Wiz Ard"


@pytest.mark.parametrize("userinfo_extra", [{"email_verified": False}, {}])
def test_google_unverified_or_absent_flag_is_not_verified(userinfo_extra):
    """An absent ``email_verified`` must read as unverified, not as "assume
    Google checked it" — the address is still returned, but it may not link."""
    identity = fetch(
        "google",
        FakeOAuthClient(
            token={"userinfo": {"sub": "s", "email": "victim@example.com", **userinfo_extra}}
        ),
    )
    assert identity.email == "victim@example.com"
    assert identity.email_verified is False


def test_google_name_falls_back_to_the_email_local_part():
    identity = fetch(
        "google",
        FakeOAuthClient(token={"userinfo": {"sub": "s", "email": "wiz@example.com"}}),
    )
    assert identity.name == "wiz"


def test_google_empty_payload_yields_a_blank_account_id():
    # No sub → the callback bails with oauth_failed rather than keying a link
    # on an empty string.
    identity = fetch("google", FakeOAuthClient(token={}))
    assert identity.provider_account_id == ""
    assert identity.email is None
    assert identity.email_verified is False
    assert identity.name == "user"


# --- GitHub -----------------------------------------------------------------------


def test_github_prefers_the_primary_verified_email():
    identity = fetch(
        "github",
        github_client(
            {"id": 42, "login": "octocat"},
            [
                {"email": "secondary@example.com", "primary": False, "verified": True},
                {"email": "primary@example.com", "primary": True, "verified": True},
            ],
        ),
    )
    assert identity.provider_account_id == "42"  # stringified for the link key
    assert identity.email == "primary@example.com"  # not merely the first verified
    assert identity.email_verified is True
    assert identity.name == "octocat"


def test_github_falls_back_to_a_verified_secondary_over_an_unverified_primary():
    """The security-critical selection: never report the primary address as
    verified just because it is primary."""
    identity = fetch(
        "github",
        github_client(
            {"id": 7, "login": "octocat"},
            [
                {"email": "unverified-primary@example.com", "primary": True, "verified": False},
                {"email": "backup@example.com", "primary": False, "verified": True},
            ],
        ),
    )
    assert identity.email == "backup@example.com"
    assert identity.email_verified is True


def test_github_no_verified_email_returns_none_unverified():
    identity = fetch(
        "github",
        github_client(
            {"id": 7, "login": "octocat", "email": "public@example.com"},
            [{"email": "unverified@example.com", "primary": True, "verified": False}],
        ),
    )
    # Neither the unverified address nor the profile's public one leaks through:
    # returning an address with verified=False would still be wrong here, since
    # a later regression flipping the flag would then have a target to link.
    assert identity.email is None
    assert identity.email_verified is False


def test_github_empty_email_list_returns_none_unverified():
    identity = fetch("github", github_client({"id": 7, "login": "octocat"}, []))
    assert identity.email is None
    assert identity.email_verified is False


def test_github_error_payload_from_emails_endpoint_is_not_verified():
    # A revoked token answers /user/emails with an object, not a list.
    identity = fetch(
        "github",
        github_client({"id": 7, "login": "octocat"}, {"message": "Bad credentials"}),
    )
    assert identity.email is None
    assert identity.email_verified is False


def test_github_reads_emails_from_the_dedicated_endpoint():
    client = github_client(
        {"id": 7, "login": "octocat", "email": "public@example.com"},
        [{"email": "real@example.com", "primary": True, "verified": True}],
    )
    identity = fetch("github", client)
    assert client.requested == ["user", "user/emails"]
    assert identity.email == "real@example.com"  # the profile's public email is ignored


def test_github_name_falls_back_to_profile_name_then_placeholder():
    with_name = fetch("github", github_client({"id": 7, "name": "Octo Cat"}, []))
    assert with_name.name == "Octo Cat"

    anonymous = fetch("github", github_client({"id": 7}, []))
    assert anonymous.name == "user"
