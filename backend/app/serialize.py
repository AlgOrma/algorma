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

import json
from datetime import datetime
from typing import Optional

from .models import Flashcard, Problem, Revision, TemplatePattern, User
from .srs import preview_intervals
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
        "leetcodeUsername": u.leetcode_username,
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
    stability = revision.stability if revision else None
    difficulty = revision.difficulty if revision else None

    # Per-grade "days until next due" for the grade buttons. Skipped for rows
    # still on legacy SM-2 state (reviewed, but not yet re-graded under FSRS).
    if stability is not None or not review_count:
        next_intervals = preview_intervals(stability, difficulty, last_reviewed_at, now)
    else:
        next_intervals = None

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

    approaches_list = []
    if p.approaches:
        approaches_list = [
            {
                "id": a.id,
                "name": a.name,
                "complexityTime": a.complexity_time,
                "complexitySpace": a.complexity_space,
                "approach": a.approach,
                "code": a.code,
                "lang": a.language,
                "position": a.position,
            }
            for a in sorted(p.approaches, key=lambda a: a.position)
        ]
    
    if not approaches_list and (p.approach or p.solution):
        approaches_list = [
            {
                "id": "default",
                "name": "Default Approach",
                "complexityTime": "",
                "complexitySpace": "",
                "approach": p.approach or "",
                "code": p.solution or "",
                "lang": "Python",
                "position": 0,
            }
        ]

    # LeetCode references
    lc = p.leetcode_question
    hints = json.loads(lc.hints) if (lc and lc.hints) else []
    solution_content = lc.solution_content if lc else None
    has_solution = lc.has_solution if lc else False
    similar_questions = json.loads(lc.similar_questions) if (lc and lc.similar_questions) else []
    stats = json.loads(lc.stats) if (lc and lc.stats) else {}
    likes = lc.likes if lc else 0
    dislikes = lc.dislikes if lc else 0
    category_title = lc.category_title if lc else "Algorithms"

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
        "checklistProgress": json.loads(p.checklist_progress) if p.checklist_progress else None,
        "patterns": [pat.name for pat in p.patterns],
        "created": created,
        "lastRevised": last_revised,
        "nextLabel": next_label,
        "nextColor": next_color,
        "dueMeta": due_meta,
        "revisions": review_count,
        # --- rich fields ---
        "approaches": approaches_list,
        "hints": hints,
        "solutionContent": solution_content,
        "hasSolution": has_solution,
        "similarQuestions": similar_questions,
        "stats": stats,
        "likes": likes,
        "dislikes": dislikes,
        "categoryTitle": category_title,
        "leetcodeId": p.leetcode_id or (lc.id if lc else None),
        # --- raw fields for future client-side formatting ---
        "topicSlug": p.topic.slug if p.topic else None,
        "leetcodeUrl": p.leetcode_url,
        "easeFactor": ease_factor,
        "intervalDays": interval_days,
        "repetitions": repetitions,
        "reviewCount": review_count,
        "srsStability": stability,
        "srsDifficulty": difficulty,
        "nextIntervals": next_intervals,
        "createdAt": _iso(p.created_at),
        "updatedAt": _iso(p.updated_at),
        "lastReviewedAt": _iso(last_reviewed_at),
        "dueAt": _iso(due_at),
        "customListIds": [cl.id for cl in p.custom_lists] if p.custom_lists else [],
    }



def serialize_template_pattern(p: TemplatePattern) -> dict:
    """Nested pattern → variations shape the Templates page consumes. Re-maps the
    DB's ``description``/``language`` back to the frontend's ``desc``/``lang``."""
    return {
        "id": p.id,
        "name": p.name,
        "topic": p.topic,
        "description": p.description,
        "variations": [
            {
                "id": v.id,
                "name": v.name,
                "desc": v.description,
                "lang": v.language,
                "code": v.code,
            }
            for v in sorted(p.variations, key=lambda v: v.position)
        ],
    }


def serialize_flashcard(
    c: Flashcard, revision: Optional[Revision] = None, now: Optional[datetime] = None
) -> dict:
    now = now or utcnow()
    due_at = revision.due_at if revision else None
    due = due_at is not None and _days_delta(due_at, now) <= 0
    review_count = revision.review_count if revision else 0
    last_reviewed_at = revision.last_reviewed_at if revision else None
    stability = revision.stability if revision else None
    difficulty = revision.difficulty if revision else None

    if stability is not None or not review_count:
        next_intervals = preview_intervals(stability, difficulty, last_reviewed_at, now)
    else:
        next_intervals = None

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
        "reviewCount": review_count,
        "srsStability": stability,
        "srsDifficulty": difficulty,
        "nextIntervals": next_intervals,
        "lastReviewedAt": _iso(last_reviewed_at),
        "dueAt": _iso(due_at),
    }
