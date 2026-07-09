import warnings
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic.warnings import UnsupportedFieldAttributeWarning

from .config import settings
from .db import check_setup, init_db
from .routers import (
    curriculums,
    flashcards,
    leetcode_questions,
    problems,
    stats,
    templates,
    topics,
    users,
    custom_lists,
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    # Local-only app: also accept any localhost port so dev/preview servers work.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["health"])
def root():
    return {"name": "AlgOrma API", "docs": "/docs", "health": "/api/health"}


@app.get("/api/health", tags=["health"])
def health():
    return {"ok": True}


app.include_router(users.router)
app.include_router(problems.router)
app.include_router(topics.router)
app.include_router(templates.router)
if settings.enable_flashcards:  # feature-flagged: UI not implemented yet
    app.include_router(flashcards.router)
app.include_router(stats.router)
app.include_router(leetcode_questions.router)
app.include_router(curriculums.router)
app.include_router(custom_lists.router)

