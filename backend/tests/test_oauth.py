"""OAuth callback tests with the provider exchange stubbed out
(AUTH_DESIGN.md test plan: link-existing vs create-new paths).

``_fetch_identity`` is the seam: it wraps the entire Authlib network
round-trip, so stubbing it exercises everything else for real — provider
registration, linking rules, session creation, redirects.
"""

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
