"""Shared fixtures: an in-memory SQLite database with one seeded user + topic.

Run from backend/:  .venv/bin/pytest
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app import db
from app.main import app
from app.models import Topic, User


@pytest.fixture
def session():
    # StaticPool shares the single in-memory connection across threads:
    # TestClient runs endpoints in a worker thread, and without it any commit
    # mid-request hands the next query a brand-new empty :memory: database.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


@pytest.fixture
def client(session, user):
    """HTTP-level client: real routing/validation against the in-memory DB.

    The seeded ``user`` fixture's id is preset as ``X-User-Id`` so user-scoped
    endpoints work out of the box; override headers per-request to test the
    unauthenticated paths. Deliberately NOT a context manager: entering the
    client would run the app lifespan (init_db/check_setup) against the real
    dev database engine instead of the test session.
    """
    app.dependency_overrides[db.get_session] = lambda: session
    yield TestClient(app, headers={"X-User-Id": user.id})
    app.dependency_overrides.clear()


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
