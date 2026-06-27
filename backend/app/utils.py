import re
from datetime import datetime, timezone


def utcnow() -> datetime:
    """Naive UTC timestamp — keeps all stored/compared datetimes consistent on SQLite."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")
