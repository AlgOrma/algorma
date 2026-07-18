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
from app.validation import MAX_PASSWORD, MIN_PASSWORD

PASSWORD = "correct-horse-battery"


@pytest.fixture
def cli(api_engine, monkeypatch):
    # claim_account binds `engine`/`init_db` at import via `from .db import`,
    # so patch its module globals, not app.db.
    monkeypatch.setattr(claim_account, "engine", api_engine)
    monkeypatch.setattr(claim_account, "init_db", lambda: None)
    return claim_account


def type_password(monkeypatch, *answers):
    """Feed ``answers`` to the getpass prompts; returns the prompts as asked."""
    replies = iter(answers)
    asked: list[str] = []

    def fake_getpass(prompt):
        asked.append(prompt)
        return next(replies)

    monkeypatch.setattr(claim_account.getpass, "getpass", fake_getpass)
    return asked


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


def test_claim_refuses_when_selector_and_email_name_different_profiles(
    cli, api_engine, monkeypatch, capsys
):
    """Both sides resolving to different profiles is the one case the CLI must
    not settle on its own: silently preferring either would set a password on
    a profile the operator didn't name — and password_hash is the whole point
    of the command, so guessing wrong hands the account to the wrong person."""
    owner = seed_user(api_engine, name="Profile A", email="you@example.com")
    other = seed_user(api_engine, name="Profile B")
    type_password(monkeypatch, PASSWORD, PASSWORD)  # never reached; catches a miss

    with pytest.raises(SystemExit) as exc:
        cli.main(["you@example.com", "--user", "Profile B"])
    assert exc.value.code == 1

    err = capsys.readouterr().err
    assert "Profile A" in err and "Profile B" in err  # both candidates, to disambiguate

    # Neither profile moved: no password on either, and B did not adopt the email.
    assert get_user(api_engine, owner.id).password_hash is None
    assert get_user(api_engine, other.id).password_hash is None
    assert get_user(api_engine, other.id).email is None


def test_claim_accepts_a_selector_that_agrees_with_the_email(cli, api_engine, monkeypatch):
    """Naming the same profile twice is agreement, not conflict."""
    user = seed_user(api_engine, name="Old Profile", email="old@example.com")
    type_password(monkeypatch, PASSWORD, PASSWORD)

    cli.main(["old@example.com", "--user", "Old Profile"])

    assert verify_password(PASSWORD, get_user(api_engine, user.id).password_hash)


def test_claim_ignores_a_selector_that_matches_no_profile(cli, api_engine, monkeypatch):
    """Only one side resolves, so there is nothing to disagree about and the
    email match wins. Deliberate, but it does mean a typo'd --user is silently
    ignored rather than reported."""
    user = seed_user(api_engine, name="Old Profile", email="old@example.com")
    type_password(monkeypatch, PASSWORD, PASSWORD)

    cli.main(["old@example.com", "--user", "No Such Profile"])

    assert verify_password(PASSWORD, get_user(api_engine, user.id).password_hash)


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


def test_claim_rejects_over_length_password(cli, api_engine, monkeypatch, capsys):
    """Regression: the CLI carried its own minimum and no maximum, so a
    password-manager passphrase over the cap hashed and stored fine — and then
    never authenticated, because login truncates to MAX_PASSWORD before
    verifying. The claim printed success and locked the operator out
    permanently, with nothing to diagnose from. Refusing here is what keeps the
    write path and the read path on the same bounds."""
    user = seed_user(api_engine, name="Old Profile", email="old@example.com")
    # One answer is enough: the check fires before the confirmation prompt.
    type_password(monkeypatch, "x" * (MAX_PASSWORD + 1))

    with pytest.raises(SystemExit) as exc:
        cli.main(["old@example.com"])
    assert exc.value.code == 1

    captured = capsys.readouterr()
    assert str(MAX_PASSWORD) in captured.err
    assert captured.out == ""  # no "Done —" success line

    # The profile is untouched, so the operator can simply retry with a shorter one.
    assert get_user(api_engine, user.id).password_hash is None


def test_claim_prompt_states_both_bounds(cli, api_engine, monkeypatch):
    """The operator has to see the cap *before* typing, otherwise the only
    feedback on a too-long passphrase is a rejection after the fact."""
    seed_user(api_engine, name="Old Profile", email="old@example.com")
    asked = type_password(monkeypatch, PASSWORD, PASSWORD)

    cli.main(["old@example.com"])

    assert str(MIN_PASSWORD) in asked[0] and str(MAX_PASSWORD) in asked[0]


@pytest.mark.parametrize(
    "password",
    ["x" * MIN_PASSWORD, PASSWORD, "x" * MAX_PASSWORD],
    ids=["at-minimum", "typical", "at-maximum"],
)
def test_a_claimed_password_can_actually_log_in(
    cli, client, api_engine, monkeypatch, password
):
    """The property the regression violated: whatever the CLI *accepts* must
    authenticate against the running API. MAX_PASSWORD is the interesting end —
    login truncates to exactly that length, so the cap and the truncation have
    to agree on which side the boundary falls."""
    seed_user(api_engine, name="Old Profile", email="old@example.com")
    type_password(monkeypatch, password, password)

    cli.main(["old@example.com"])

    res = client.post(
        "/api/auth/login",
        json={"identifier": "old@example.com", "password": password, "remember": False},
    )
    assert res.status_code == 200
    assert res.json()["email"] == "old@example.com"


def test_claim_rejects_mismatched_confirmation(cli, api_engine, monkeypatch):
    user = seed_user(api_engine, name="Old Profile", email="old@example.com")
    type_password(monkeypatch, PASSWORD, "something-else-entirely")

    with pytest.raises(SystemExit):
        cli.main(["old@example.com"])
    assert get_user(api_engine, user.id).password_hash is None


def test_claim_rejects_invalid_email(cli):
    with pytest.raises(SystemExit):
        cli.main(["not-an-email"])
