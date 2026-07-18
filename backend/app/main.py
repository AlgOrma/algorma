import secrets
import warnings
from contextlib import asynccontextmanager
from urllib.parse import SplitResult, urlsplit, urlunsplit

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic.warnings import UnsupportedFieldAttributeWarning
from slowapi.errors import RateLimitExceeded
from starlette.middleware.sessions import SessionMiddleware

from .config import settings
from .db import check_setup, init_db
from .ratelimit import limiter
from .routers import (
    auth,
    curriculums,
    custom_lists,
    flashcards,
    leetcode_questions,
    leetcode_sync,
    problems,
    stats,
    templates,
    topics,
    users,
)

# FastAPI 0.115 re-validates each request body field via _compat.ModelField,
# re-applying the camelCase aliases our CamelModel generates (alias_generator).
# Pydantic 2.13 flags that as UnsupportedFieldAttributeWarning on every request,
# even though the aliases work correctly. Silence the benign, repetitive noise;
# revisit if a FastAPI/pydantic upgrade resolves the interaction upstream.
warnings.filterwarnings("ignore", category=UnsupportedFieldAttributeWarning)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # create tables + apply schema migrations
    check_setup()  # warn (non-blocking) if reference data isn't seeded yet
    yield


app = FastAPI(title="AlgOrma API", version="0.1.0", lifespan=lifespan)

# Brute-force protection on login/register (slowapi). The handler keeps the
# frontend's error shape: it reads `detail` off non-2xx JSON bodies.
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _rate_limited(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many attempts — try again in a minute."},
    )


# localhost and 127.0.0.1 are different origins to a browser but the same dev
# server to a human, so each configured one implies the other — same port, so
# this widens nothing an operator didn't already opt into.
_LOOPBACK_ALIASES = {"localhost": "127.0.0.1", "127.0.0.1": "localhost"}


def _origin_error(origin: str, reason: str) -> ValueError:
    return ValueError(
        f"Invalid WEB_ORIGIN entry {origin!r}: {reason}. WEB_ORIGIN is a comma-separated "
        'list of browser origins, e.g. "https://algorma.example.com,http://localhost:4173".'
    )


def _parse_origin(origin: str) -> SplitResult:
    """Validate one WEB_ORIGIN entry, or raise an error that names the setting.

    urlsplit parses lazily: `.port` raises from deep inside urllib for a
    non-numeric or out-of-range port. The allow-list is built at import time,
    so that surfaced as a traceback which never mentioned WEB_ORIGIN. Every
    entry is checked here rather than only the loopback ones that read `.port`,
    so a typo fails the same way wherever it sits in the list.

    Refusing to start is deliberate. A malformed entry can never match a browser
    Origin header, so skipping it would leave an allow-list that looks correct
    but silently denies the frontend it was written for.
    """
    parts = urlsplit(origin)
    try:
        parts.port  # lazily parsed; raises for a non-numeric / out-of-range port
    except ValueError as exc:
        raise _origin_error(origin, str(exc).lower()) from exc
    if parts.scheme not in ("http", "https"):
        raise _origin_error(origin, "expected an http:// or https:// scheme")
    if not parts.hostname:
        raise _origin_error(origin, "no host")
    if parts.path or parts.query or parts.fragment:
        raise _origin_error(origin, "expected scheme://host[:port] and nothing else")
    # netloc must be exactly host[:port]. Userinfo ("user@host") and a bare
    # trailing colon survive every check above, but a browser Origin header
    # carries neither, so such an entry can never match — the silent-denial
    # this function exists to prevent. Bracket IPv6 literals to rebuild the
    # netloc, since .hostname strips them off ("[::1]:80" -> "::1").
    host = f"[{parts.hostname}]" if ":" in parts.hostname else parts.hostname
    expected = f"{host}:{parts.port}" if parts.port is not None else host
    if parts.netloc.lower() != expected:
        raise _origin_error(origin, "expected scheme://host[:port] and nothing else")
    return parts


def _allowed_origins() -> list[str]:
    """Explicit credentialed-CORS allow-list, parsed from WEB_ORIGIN.

    Deliberately not a wildcard-localhost regex. Requests now carry the session
    cookie, and browsers treat every http://localhost:<port> as the same site
    for SameSite=Lax — so trusting arbitrary loopback ports would let any other
    process on the machine (another project's dev server, a local docs site
    with an XSS, a desktop app embedding an HTTP server) call this API with
    credentials and act as the logged-in user. A self-hoster on a non-default
    port adds it to the comma-separated list instead.

    An empty list is a valid configuration: it means no cross-origin browser
    access at all, which is correct when one process serves both API and UI.
    """
    origins: list[str] = []
    for raw in settings.web_origin.split(","):
        origin = raw.strip().rstrip("/")
        if not origin or origin in origins:
            continue
        parts = _parse_origin(origin)
        origins.append(origin)
        if alias := _LOOPBACK_ALIASES.get(parts.hostname or ""):
            host = f"{alias}:{parts.port}" if parts.port else alias
            mirrored = urlunsplit((parts.scheme, host, "", "", ""))
            if mirrored not in origins:
                origins.append(mirrored)
    return origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Only the Authlib OAuth handshake (state + PKCE) uses this session cookie;
# app auth rides the separate algorma_session cookie. Without an explicit
# SESSION_SECRET each process signs with its own ephemeral key — harmless for
# email/password, but OAuth across multiple workers needs the env var.
if configured_oauth := auth.configured_providers():
    if not settings.session_secret:
        print(
            f"WARNING: OAuth ({', '.join(configured_oauth)}) is configured but "
            "SESSION_SECRET is not set; sign-in will break if uvicorn runs "
            "multiple workers."
        )
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret or secrets.token_urlsafe(32),
    same_site="lax",
    https_only=settings.cookie_secure,
)


@app.get("/", tags=["health"])
def root():
    return {"name": "AlgOrma API", "docs": "/docs", "health": "/api/health"}


@app.get("/api/health", tags=["health"])
def health():
    return {"ok": True}


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(problems.router)
app.include_router(topics.router)
app.include_router(templates.router)
if settings.enable_flashcards:  # feature-flagged: UI not implemented yet
    app.include_router(flashcards.router)
app.include_router(stats.router)
app.include_router(leetcode_questions.router)
app.include_router(leetcode_sync.router)
app.include_router(curriculums.router)
app.include_router(custom_lists.router)

