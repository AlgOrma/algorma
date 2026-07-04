"""Shared fixtures: an in-memory SQLite database with one seeded user + topic.

Run from backend/:  .venv/bin/pytest
"""

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.models import Topic, User


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
