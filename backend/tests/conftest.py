"""Shared fixtures: an in-memory SQLite database with one seeded user + topic.

Run from backend/:  .venv/bin/pytest
"""

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.models import Topic, User


@pytest.fixture
def api_engine():
    """Engine for HTTP-level tests: StaticPool shares the single in-memory
    database across the separate Session opened per request."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture
def client(api_engine):
    """TestClient against the real app, isolated onto ``api_engine``.

    Deliberately not a context manager: entering TestClient runs the app
    lifespan, and init_db() would touch the developer's real SQLite file.
    The rate limiter resets per test so limits don't leak between tests.
    """
    from fastapi.testclient import TestClient

    from app.db import get_session
    from app.main import app
    from app.ratelimit import limiter

    def override():
        with Session(api_engine) as s:
            yield s

    app.dependency_overrides[get_session] = override
    limiter.reset()
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


@pytest.fixture
def user(session):
    u = User(name="Test User")
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


@pytest.fixture
def topic(session):
    t = Topic(name="Arrays", slug="arrays")
    session.add(t)
    session.commit()
    session.refresh(t)
    return t
