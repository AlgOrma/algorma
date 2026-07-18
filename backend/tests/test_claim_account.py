"""Tests for the `python -m app.claim_account` CLI — the documented adoption
path for pre-auth installs (AUTH_DESIGN.md "Upgrade path"). A regression here
strands exactly the users the flow exists for, so every branch of _pick_user
and the password prompt is pinned.
"""

import pytest
from sqlmodel import Session

import app.claim_account as claim_account
from app.models import User
from app.security import verify_password

PASSWORD = "correct-horse-battery"


@pytest.fixture
def cli(api_engine, monkeypatch):
    # claim_account binds `engine`/`init_db` at import via `from .db import`,
    # so patch its module globals, not app.db.
    monkeypatch.setattr(claim_account, "engine", api_engine)
    monkeypatch.setattr(claim_account, "init_db", lambda: None)
    return claim_account


def type_password(monkeypatch, *answers):
    prompts = iter(answers)
    monkeypatch.setattr(claim_account.getpass, "getpass", lambda prompt: next(prompts))


def seed_user(api_engine, **kwargs):
    with Session(api_engine) as s:
        user = User(**kwargs)
        s.add(user)
        s.commit()
        s.refresh(user)
        return user


def get_user(api_engine, user_id):
    with Session(api_engine) as s:
        return s.get(User, user_id)


def test_claim_by_email_case_insensitive(cli, api_engine, monkeypatch):
    user = seed_user(api_engine, name="Old Profile", email="old@example.com")
    type_password(monkeypatch, PASSWORD, PASSWORD)

    cli.main(["Old@Example.COM"])

    claimed = get_user(api_engine, user.id)
    assert verify_password(PASSWORD, claimed.password_hash)


def test_claim_attaches_email_via_user_selector(cli, api_engine, monkeypatch):
    user = seed_user(api_engine, name="No Email Yet")
    type_password(monkeypatch, PASSWORD, PASSWORD)

    cli.main(["new@example.com", "--user", "No Email Yet"])

    claimed = get_user(api_engine, user.id)
    assert claimed.email == "new@example.com"  # normalized lowercase
    assert verify_password(PASSWORD, claimed.password_hash)


def test_claim_refuses_conflicting_email(cli, api_engine, monkeypatch):
    user = seed_user(api_engine, name="Old Profile", email="real@example.com")
    type_password(monkeypatch, PASSWORD, PASSWORD)

    with pytest.raises(SystemExit):
        cli.main(["other@example.com", "--user", "Old Profile"])

    untouched = get_user(api_engine, user.id)
    assert untouched.email == "real@example.com"
    assert untouched.password_hash is None


def test_claim_unknown_email_lists_profiles_and_exits(cli, api_engine, capsys):
    seed_user(api_engine, name="Somebody", email="somebody@example.com")

    with pytest.raises(SystemExit):
        cli.main(["ghost@example.com"])

    err = capsys.readouterr().err
    assert "Somebody" in err  # points the self-hoster at --user


def test_claim_rejects_short_password(cli, api_engine, monkeypatch):
    user = seed_user(api_engine, name="Old Profile", email="old@example.com")
    type_password(monkeypatch, "short")

    with pytest.raises(SystemExit):
        cli.main(["old@example.com"])
    assert get_user(api_engine, user.id).password_hash is None


def test_claim_rejects_mismatched_confirmation(cli, api_engine, monkeypatch):
    user = seed_user(api_engine, name="Old Profile", email="old@example.com")
    type_password(monkeypatch, PASSWORD, "something-else-entirely")

    with pytest.raises(SystemExit):
        cli.main(["old@example.com"])
    assert get_user(api_engine, user.id).password_hash is None


def test_claim_rejects_invalid_email(cli):
    with pytest.raises(SystemExit):
        cli.main(["not-an-email"])
