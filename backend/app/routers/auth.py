"""Cookie-session authentication endpoints.

The wire contract here is mirrored byte-for-byte by ``frontend/src/api.js``
and ``frontend/src/pages/Auth.jsx`` — change them together.

Security notes (kept deliberately boring):
- Login failures are a uniform, vague 401 and always cost one Argon2
  verification, so neither the message nor the timing reveals whether an
  account exists.
- OAuth linking requires a *provider-verified* email; otherwise anyone could
  register the victim's address at a provider and take over their account.
- CSRF: the session cookie is SameSite=Lax and CORS restricts credentialed
  origins, which together cover these JSON POST endpoints.
"""

import secrets
from dataclasses import dataclass
from datetime import timedelta
from typing import Optional

from authlib.integrations.starlette_client import OAuth, OAuthError
from email_validator import EmailNotValidError, validate_email
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, func
from sqlmodel import Session, select

from ..config import settings
from ..db import get_session
from ..deps import SESSION_COOKIE
from ..models import AuthSession, OAuthAccount, User
from ..ratelimit import limiter
from ..schemas import LoginIn, RegisterIn
from ..security import generate_token, hash_password, hash_token, verify_password
from ..seed import seed_starter_patterns
from ..serialize import serialize_user
from ..utils import utcnow

router = APIRouter(prefix="/api/auth", tags=["auth"])

PROVIDERS = ("google", "github")

# NIST 800-63B: length is the policy — no composition rules. The cap only
# bounds Argon2 hashing cost. The frontend enforces the same minimum.
_MIN_PASSWORD = 8
_MAX_PASSWORD = 128
_MAX_NAME = 50


# --- validation helpers -----------------------------------------------------


def _normalize_email(raw: str) -> str:
    """Syntax-validate and lowercase, so lookups are case-insensitive."""
    try:
        return validate_email(raw.strip(), check_deliverability=False).normalized.lower()
    except EmailNotValidError:
        raise HTTPException(status_code=400, detail="That email doesn't look right.")


def _validate_password(password: str) -> None:
    if len(password) < _MIN_PASSWORD:
        raise HTTPException(
            status_code=400,
            detail=f"Your password needs at least {_MIN_PASSWORD} characters.",
        )
    if len(password) > _MAX_PASSWORD:
        raise HTTPException(
            status_code=400,
            detail=f"Passwords are capped at {_MAX_PASSWORD} characters.",
        )


def _validate_name(raw: str) -> str:
    name = raw.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Pick a username to continue.")
    if len(name) > _MAX_NAME:
        raise HTTPException(
            status_code=400, detail=f"Usernames are capped at {_MAX_NAME} characters."
        )
    if "@" in name:
        # Login accepts "email or username"; keeping '@' out of usernames
        # keeps that lookup unambiguous.
        raise HTTPException(status_code=400, detail="Usernames can't contain '@'.")
    return name


def _email_taken(session: Session, email: str) -> bool:
    return (
        session.exec(select(User).where(func.lower(User.email) == email)).first()
        is not None
    )


def _name_taken(session: Session, name: str) -> bool:
    return (
        session.exec(
            select(User).where(func.lower(User.name) == name.lower())
        ).first()
        is not None
    )


# --- session plumbing --------------------------------------------------------


def _start_session(
    session: Session,
    user: User,
    request: Request,
    response: Response,
    *,
    persistent: bool,
) -> None:
    """Create an AuthSession row and set the cookie on ``response``.

    ``persistent=False`` (login without "remember me") omits Max-Age so the
    cookie dies with the browser; the server-side row expires after the full
    TTL either way.
    """
    now = utcnow()
    # Lazy purge: every login sweeps out expired rows.
    session.execute(delete(AuthSession).where(AuthSession.expires_at <= now))

    token = generate_token()
    ttl = timedelta(days=settings.session_ttl_days)
    session.add(
        AuthSession(
            token_hash=hash_token(token),
            user_id=user.id,
            expires_at=now + ttl,
            last_used_at=now,
            user_agent=(request.headers.get("user-agent") or "")[:255] or None,
        )
    )
    session.commit()

    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(ttl.total_seconds()) if persistent else None,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


# --- email/password endpoints ------------------------------------------------


@router.post("/register", status_code=201)
@limiter.limit("5/minute")
def register(
    request: Request,
    response: Response,
    payload: RegisterIn,
    session: Session = Depends(get_session),
):
    if not settings.allow_registration:
        raise HTTPException(
            status_code=403, detail="Registration is disabled on this instance."
        )

    name = _validate_name(payload.name)
    email = _normalize_email(payload.email)
    _validate_password(payload.password)

    if _email_taken(session, email):
        raise HTTPException(status_code=409, detail="Email already in use")
    if _name_taken(session, name):
        raise HTTPException(status_code=409, detail="That username is taken")

    user = User(name=name, email=email, password_hash=hash_password(payload.password))
    session.add(user)
    session.commit()
    session.refresh(user)

    # Same starter library POST /api/users used to seed (register supersedes it).
    seed_starter_patterns(session, user.id)

    _start_session(session, user, request, response, persistent=True)
    return serialize_user(user)


@router.post("/login")
@limiter.limit("10/minute")
def login(
    request: Request,
    response: Response,
    payload: LoginIn,
    session: Session = Depends(get_session),
):
    identifier = payload.identifier.strip()

    user: Optional[User] = None
    if "@" in identifier:
        user = session.exec(
            select(User).where(func.lower(User.email) == identifier.lower())
        ).first()
    else:
        matches = session.exec(
            select(User).where(func.lower(User.name) == identifier.lower())
        ).all()
        # Pre-auth profiles could share a name; only an unambiguous match may
        # log in by username (the others use their email).
        if len(matches) == 1:
            user = matches[0]

    # Always verify — unknown users burn the same Argon2 work as wrong
    # passwords, and the 401 message never says which case it was.
    authenticated = verify_password(
        payload.password, user.password_hash if user else None
    )
    if not user or not authenticated:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    _start_session(session, user, request, response, persistent=payload.remember)
    return serialize_user(user)


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        row = session.exec(
            select(AuthSession).where(AuthSession.token_hash == hash_token(token))
        ).first()
        if row:
            session.delete(row)
            session.commit()
    response.delete_cookie(
        SESSION_COOKIE,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
    )


# --- OAuth (Authlib) ----------------------------------------------------------

oauth = OAuth()
_registered: set[str] = set()


def _provider_credentials(provider: str) -> tuple[str, str]:
    if provider == "google":
        return settings.google_client_id, settings.google_client_secret
    if provider == "github":
        return settings.github_client_id, settings.github_client_secret
    return "", ""


def configured_providers() -> list[str]:
    """Providers with both credentials set — read dynamically from settings."""
    return [p for p in PROVIDERS if all(_provider_credentials(p))]


def _get_oauth_client(provider: str):
    """Register lazily (first use) so configuration stays a pure env concern."""
    if provider not in configured_providers():
        return None
    if provider not in _registered:
        client_id, client_secret = _provider_credentials(provider)
        if provider == "google":
            oauth.register(
                "google",
                client_id=client_id,
                client_secret=client_secret,
                server_metadata_url=(
                    "https://accounts.google.com/.well-known/openid-configuration"
                ),
                client_kwargs={"scope": "openid email profile"},
            )
        else:
            oauth.register(
                "github",
                client_id=client_id,
                client_secret=client_secret,
                access_token_url="https://github.com/login/oauth/access_token",
                authorize_url="https://github.com/login/oauth/authorize",
                api_base_url="https://api.github.com/",
                client_kwargs={"scope": "read:user user:email"},
            )
        _registered.add(provider)
    return oauth.create_client(provider)


def _error_redirect(code: str) -> RedirectResponse:
    """Per the wire contract, OAuth failures land on the frontend with
    ``?error=<code>`` (the frontend shows a generic message)."""
    separator = "&" if "?" in settings.frontend_url else "?"
    return RedirectResponse(f"{settings.frontend_url}{separator}error={code}")


@dataclass
class OAuthIdentity:
    provider_account_id: str
    email: Optional[str]
    email_verified: bool
    name: str


async def _fetch_identity(provider: str, client, request: Request) -> OAuthIdentity:
    """Exchange the callback code and normalize the provider's profile.

    Kept as one seam so tests can stub the whole network exchange.
    """
    token = await client.authorize_access_token(request)

    if provider == "google":
        info = token.get("userinfo") or {}
        email = info.get("email")
        return OAuthIdentity(
            provider_account_id=str(info.get("sub") or ""),
            email=email,
            email_verified=bool(info.get("email_verified")),
            name=info.get("name") or (email or "user").split("@")[0],
        )

    # GitHub: the profile's public email may be absent/unverified — the
    # /user/emails endpoint is the source of truth for verified addresses.
    profile = (await client.get("user", token=token)).json()
    email: Optional[str] = None
    verified = False
    emails = (await client.get("user/emails", token=token)).json()
    if isinstance(emails, list):
        primary = next(
            (e for e in emails if e.get("primary") and e.get("verified")), None
        )
        chosen = primary or next((e for e in emails if e.get("verified")), None)
        if chosen:
            email = chosen.get("email")
            verified = True
    return OAuthIdentity(
        provider_account_id=str(profile.get("id") or ""),
        email=email,
        email_verified=verified,
        name=profile.get("login") or profile.get("name") or "user",
    )


def _unique_name(session: Session, base: str) -> str:
    """A username for an OAuth signup that won't collide with existing ones."""
    base = base.strip().replace("@", "")[:_MAX_NAME] or "user"
    name = base
    while _name_taken(session, name):
        name = f"{base[: _MAX_NAME - 5]}-{secrets.randbelow(10000):04d}"
    return name


@router.get("/providers")
def providers() -> list[str]:
    return configured_providers()


@router.get("/{provider}/authorize")
async def oauth_authorize(provider: str, request: Request):
    client = _get_oauth_client(provider)
    if client is None:
        return _error_redirect("unknown_provider")
    redirect_uri = str(request.url_for("oauth_callback", provider=provider))
    try:
        return await client.authorize_redirect(request, redirect_uri)
    except OAuthError:
        return _error_redirect("oauth_failed")


@router.get("/{provider}/callback", name="oauth_callback")
async def oauth_callback(
    provider: str,
    request: Request,
    session: Session = Depends(get_session),
):
    client = _get_oauth_client(provider)
    if client is None:
        return _error_redirect("unknown_provider")

    try:
        identity = await _fetch_identity(provider, client, request)
    except OAuthError:
        return _error_redirect("oauth_failed")
    if not identity.provider_account_id:
        return _error_redirect("oauth_failed")

    account = session.exec(
        select(OAuthAccount).where(
            OAuthAccount.provider == provider,
            OAuthAccount.provider_account_id == identity.provider_account_id,
        )
    ).first()

    if account:
        user = session.get(User, account.user_id)
        if user is None:  # orphaned link — drop it and start over
            session.delete(account)
            session.commit()
            return _error_redirect("oauth_failed")
    else:
        # Linking rule: a provider-VERIFIED email matching an
        # existing user links to it; anything unverified is rejected outright.
        if not identity.email or not identity.email_verified:
            return _error_redirect("email_unverified")
        email = identity.email.lower()
        user = session.exec(
            select(User).where(func.lower(User.email) == email)
        ).first()
        if user is None:
            if not settings.allow_registration:
                return _error_redirect("registration_disabled")
            user = User(
                name=_unique_name(session, identity.name),
                email=email,
                password_hash=None,
            )
            session.add(user)
            session.commit()
            session.refresh(user)
            seed_starter_patterns(session, user.id)
        session.add(
            OAuthAccount(
                provider=provider,
                provider_account_id=identity.provider_account_id,
                user_id=user.id,
            )
        )
        session.commit()

    redirect = RedirectResponse(settings.frontend_url)
    _start_session(session, user, request, redirect, persistent=True)
    return redirect
