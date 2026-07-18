"""Password hashing and opaque-token primitives for cookie-session auth.

Argon2id via pwdlib (AUTH_DESIGN.md). Session tokens are 32-byte urlsafe
random strings; only their SHA-256 hex digest is stored, so a leaked database
cannot be replayed as a login — the raw token exists only in the client's
cookie.
"""

import hashlib
import secrets

from pwdlib import PasswordHash

_hasher = PasswordHash.recommended()  # Argon2id

# Verified against when the identifier matches no account, so a "no such
# user" login costs the same as a "wrong password" one (no user enumeration
# through response timing).
_DUMMY_HASH = PasswordHash.recommended().hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    """Verify a password; a ``None`` hash (unknown user / OAuth-only account)
    still runs a full Argon2 verification before returning False."""
    matched = _hasher.verify(password, password_hash or _DUMMY_HASH)
    return matched and password_hash is not None


def generate_token() -> str:
    """Opaque session token for the cookie (~256 bits of entropy)."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """SHA-256 hex digest — the only form of the token ever stored."""
    return hashlib.sha256(token.encode()).hexdigest()
