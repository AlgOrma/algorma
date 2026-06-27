"""Serializers that emit the exact shape the existing React frontend consumes.

The frontend reads pre-formatted display strings (``created``, ``lastRevised``,
``nextLabel``, ``dueMeta``, ``nextColor``) plus a boolean ``due`` flag. We keep
those for a near drop-in swap from localStorage, and additionally expose the raw
fields (ISO timestamps, SRS state) so the UI can move to client-side formatting
later.

SRS state now lives in a separate ``Revision`` row (one per user per item), so
the problem/flashcard serializers take the matching revision (or ``None`` for an
item the user has never scheduled).
"""

from datetime import datetime
from typing import Optional

from .models import Flashcard, Problem, Revision, User
from .utils import utcnow

# CSS custom properties already used by the frontend's data layer.
_COLOR_OVERDUE = "var(--color-accent-red-hover)"
_COLOR_DUE = "var(--color-accent)"
_COLOR_FUTURE = "var(--color-text-muted)"
_COLOR_NONE = "var(--color-border-accent)"


def _days_delta(target: datetime, now: datetime) -> int:
    return round((target - now).total_seconds() / 86400)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() + "Z" if dt else None


def serialize_user(u: User) -> dict:
    return {
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "timezone": u.timezone,
        "dailyGoal": u.daily_goal,
        "bio": u.bio,
        "createdAt": _iso(u.created_at),
        "updatedAt": _iso(u.updated_at),
    }


def serialize_problem(
    p: Problem, revision: Optional[Revision] = None, now: Optional[datetime] = None
) -> dict:
    now = now or utcnow()

    # SRS state comes from the per-user Revision; absent → never scheduled.
    review_count = revision.review_count if revision else 0
    last_reviewed_at = revision.last_reviewed_at if revision else None
    due_at = revision.due_at if revision else None
    ease_factor = revision.ease_factor if revision else 2.5
    interval_days = revision.interval_days if revision else 0
    repetitions = revision.repetitions if revision else 0

    days_since_created = _days_delta(now, p.created_at)
    created = "today" if days_since_created <= 0 else f"{days_since_created}d ago"

    if review_count and last_reviewed_at:
        days_since_review = max(0, _days_delta(now, last_reviewed_at))
        last_revised = f"{days_since_review}d ago · {review_count}×"
    else:
        days_since_review = None
        last_revised = "—"

    if due_at is None:
        diff = None
        due = False
        next_label = "—"
        next_color = _COLOR_NONE
    else:
        diff = _days_delta(due_at, now)
        due = diff <= 0
        if diff == 0:
            next_label, next_color = "today", _COLOR_DUE
        elif diff < 0:
            next_label, next_color = f"{diff}d", _COLOR_OVERDUE
        else:
            next_label, next_color = f"in {diff}d", _COLOR_FUTURE

    if not review_count:
        due_meta = {
            "Not started": "not started",
            "Solving": "in progress",
            "Done": "completed",
        }.get(p.status, "not started")
    elif diff is not None and diff < 0:
        due_meta = f"overdue {abs(diff)}d"
    else:
        due_meta = f"revised {days_since_review}d ago · {review_count}×"

    return {
        # --- shape the existing frontend reads ---
        "id": p.id,
        "title": p.title,
        "topic": p.topic.name if p.topic else None,
        "difficulty": p.difficulty,
        "status": p.status,
        "due": due,
        "statement": p.statement,
        "exIn": p.example_input,
        "exOut": p.example_output,
        "approach": p.approach,
        "solution": p.solution,
        "notes": p.notes,
        "patterns": [pat.name for pat in p.patterns],
        "created": created,
        "lastRevised": last_revised,
        "nextLabel": next_label,
        "nextColor": next_color,
        "dueMeta": due_meta,
        "revisions": review_count,
        # --- raw fields for future client-side formatting ---
        "topicSlug": p.topic.slug if p.topic else None,
        "leetcodeUrl": p.leetcode_url,
        "easeFactor": ease_factor,
        "intervalDays": interval_days,
        "repetitions": repetitions,
        "reviewCount": review_count,
        "createdAt": _iso(p.created_at),
        "updatedAt": _iso(p.updated_at),
        "lastReviewedAt": _iso(last_reviewed_at),
        "dueAt": _iso(due_at),
    }


def serialize_flashcard(
    c: Flashcard, revision: Optional[Revision] = None, now: Optional[datetime] = None
) -> dict:
    now = now or utcnow()
    due_at = revision.due_at if revision else None
    due = due_at is not None and _days_delta(due_at, now) <= 0
    return {
        "id": c.id,
        "type": c.type,
        "tag": c.tag,
        "front": c.front,
        "back": c.back,
        "due": due,
        "easeFactor": revision.ease_factor if revision else 2.5,
        "intervalDays": revision.interval_days if revision else 0,
        "repetitions": revision.repetitions if revision else 0,
        "reviewCount": revision.review_count if revision else 0,
        "lastReviewedAt": _iso(revision.last_reviewed_at if revision else None),
        "dueAt": _iso(due_at),
    }
