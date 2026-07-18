import secrets
import warnings
from contextlib import asynccontextmanager

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


app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    # Local-only app: also accept any localhost port so dev/preview servers work.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
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

