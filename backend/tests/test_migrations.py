"""The AUTH_DESIGN.md upgrade path, exercised for real: init_db() must take a
pre-auth database to the current schema without touching existing rows, and
re-running must be a no-op. The app fixtures bypass init_db (they create the
schema directly), so this is the only automated guard on the migration chain.
"""

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine, select

import app.db as db_module
from app.models import User


def make_pre_auth_db(tmp_path):
    """Current schema minus everything the auth change introduced."""
    engine = create_engine(
        f"sqlite:///{tmp_path / 'old.db'}",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)
    with engine.connect() as conn:
        conn.execute(text('ALTER TABLE "user" DROP COLUMN password_hash'))
        conn.execute(text("DROP TABLE auth_session"))
        conn.execute(text("DROP TABLE oauth_account"))
        conn.execute(
            text(
                "INSERT INTO user (id, name, email, timezone, daily_goal, created_at, updated_at) "
                "VALUES ('u1', 'Old Profile', 'old@example.com', 'UTC', 10, '2024-01-01', '2024-01-01')"
            )
        )
        conn.commit()
    return engine


def test_init_db_migrates_pre_auth_database(tmp_path, monkeypatch):
    engine = make_pre_auth_db(tmp_path)
    monkeypatch.setattr(db_module, "engine", engine)

    db_module.init_db()

    inspector = inspect(engine)
    user_columns = {c["name"] for c in inspector.get_columns("user")}
    assert "password_hash" in user_columns
    assert inspector.has_table("auth_session")
    assert inspector.has_table("oauth_account")

    # Non-destructive: the pre-auth row survives, unclaimed.
    with Session(engine) as s:
        row = s.exec(select(User).where(User.id == "u1")).one()
        assert row.name == "Old Profile"
        assert row.email == "old@example.com"
        assert row.password_hash is None


def test_init_db_is_idempotent(tmp_path, monkeypatch):
    engine = make_pre_auth_db(tmp_path)
    monkeypatch.setattr(db_module, "engine", engine)

    db_module.init_db()
    db_module.init_db()  # second run must not raise or duplicate anything

    with Session(engine) as s:
        assert len(s.exec(select(User)).all()) == 1
