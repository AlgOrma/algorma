"""Set a password on an existing profile so pre-auth installs keep their data.

AUTH_DESIGN.md upgrade path: profiles created before authentication landed
have no password. Whoever can run this command against the SQLite file is
already inside the trust boundary of a self-hosted instance, so claiming is
a local CLI, not an HTTP endpoint:

    python -m app.claim_account you@example.com

If the profile predates emails entirely, select it by name (or id) and the
email is attached in the same step:

    python -m app.claim_account you@example.com --user "Your Profile Name"

Run from backend/ (the SQLite path is relative to it). Also handy as a
password reset for self-hosters — resetting via email is a hosted-instance
feature (milestone 2).
"""

import argparse
import getpass
import sys

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import func
from sqlmodel import Session, select

from .db import engine, init_db
from .models import User
from .security import hash_password
from .utils import utcnow
from .validation import MAX_PASSWORD, MIN_PASSWORD


def _fail(message: str) -> "None":
    print(f"error: {message}", file=sys.stderr)
    sys.exit(1)


def _pick_user(session: Session, email: str, selector: str | None) -> User:
    user = session.exec(
        select(User).where(func.lower(User.email) == email)
    ).first()

    if selector:
        selected = session.exec(
            select(User).where((User.id == selector) | (User.name == selector))
        ).first()
        # Preferring either side here would set a password on a profile the
        # operator didn't name — the one failure mode this CLI must not have,
        # since the whole point is claiming a specific pre-auth account.
        if user is not None and selected is not None and selected.id != user.id:
            _fail(
                f"email {email!r} is on profile {user.name!r}, but --user "
                f"{selector!r} selects profile {selected.name!r}; drop --user "
                f"to claim {user.name!r}, or claim {selected.name!r} with its "
                "own email"
            )
        if user is not None:
            return user
        if selected is None:
            _fail(f"no profile with id or name {selector!r}")
        if selected.email and selected.email.lower() != email:
            _fail(
                f"profile {selected.name!r} already has email "
                f"{selected.email!r}; pass that email instead"
            )
        selected.email = email  # attaching the email is part of the claim
        return selected

    if user is not None:
        return user

    print(f"No profile has the email {email!r}.", file=sys.stderr)
    users = session.exec(select(User).order_by(User.created_at)).all()
    if users:
        print("Existing profiles (use --user to claim one):", file=sys.stderr)
        for u in users:
            claimed = "claimed" if u.password_hash else "unclaimed"
            print(f"  {u.name!r}  email={u.email!r}  ({claimed})", file=sys.stderr)
    sys.exit(1)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="python -m app.claim_account",
        description="Set a password on an existing profile (see AUTH_DESIGN.md).",
    )
    parser.add_argument("email", help="the account's email (attached if missing)")
    parser.add_argument(
        "--user",
        help="profile name or id, for profiles that don't have an email yet",
    )
    args = parser.parse_args(argv)

    try:
        email = validate_email(
            args.email.strip(), check_deliverability=False
        ).normalized.lower()
    except EmailNotValidError as exc:
        _fail(f"invalid email: {exc}")

    init_db()  # make sure the password_hash column / auth tables exist

    with Session(engine) as session:
        user = _pick_user(session, email, args.user)

        password = getpass.getpass(
            f"New password for {user.name!r} "
            f"({MIN_PASSWORD}-{MAX_PASSWORD} chars): "
        )
        if len(password) < MIN_PASSWORD:
            _fail(f"password needs at least {MIN_PASSWORD} characters")
        # Login truncates to MAX_PASSWORD before hashing (bounding the Argon2
        # work an unauthenticated body can buy) and fails anything longer, so a
        # password stored past the cap here would hash fine and then never
        # authenticate — a claim that reports success and locks the operator
        # out. This is the only other writer of password_hash besides
        # /api/auth/register, so it has to hold register's bounds exactly.
        if len(password) > MAX_PASSWORD:
            _fail(f"password is capped at {MAX_PASSWORD} characters")
        if password != getpass.getpass("Repeat password: "):
            _fail("passwords don't match")

        user.password_hash = hash_password(password)
        user.updated_at = utcnow()
        session.add(user)
        session.commit()
        print(f"Done — {user.name!r} can now log in as {email}.")


if __name__ == "__main__":
    main()
