"""Unit tests for app/security.py: hashing round-trips and token primitives."""

from app.security import generate_token, hash_password, hash_token, verify_password


def test_password_round_trip():
    hashed = hash_password("correct horse battery staple")
    assert hashed != "correct horse battery staple"
    assert hashed.startswith("$argon2")  # AUTH_DESIGN.md: Argon2 via pwdlib
    assert verify_password("correct horse battery staple", hashed)


def test_wrong_password_rejected():
    hashed = hash_password("right-password")
    assert not verify_password("wrong-password", hashed)


def test_none_hash_rejected():
    # OAuth-only accounts / unknown users: verification still runs (timing)
    # but can never succeed.
    assert not verify_password("anything", None)
    assert not verify_password("", None)


def test_hashes_are_salted():
    assert hash_password("same input") != hash_password("same input")


def test_generate_token_shape_and_uniqueness():
    tokens = {generate_token() for _ in range(50)}
    assert len(tokens) == 50  # no collisions
    assert all(len(t) >= 43 for t in tokens)  # 32 bytes urlsafe-encoded


def test_hash_token_deterministic_hex():
    token = generate_token()
    assert hash_token(token) == hash_token(token)
    digest = hash_token(token)
    assert len(digest) == 64
    assert int(digest, 16) is not None  # valid hex
    assert hash_token("other") != digest
