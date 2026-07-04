"""FSRS scheduling (the open-spaced-repetition algorithm).

Revisions are scheduled with FSRS-6 via the official ``fsrs`` package
(py-fsrs). Per-item state is (stability, difficulty) on ``Revision``;
retrievability is derived from the *actual* time elapsed since the last
review, so an early review (e.g. a forced revision) barely moves the schedule
while a late-but-successful one earns a bigger stability boost.

Product choices baked in here:

- Day-granularity scheduling: learning/relearning steps are disabled, so every
  item lives in FSRS's long-term ("Review") state from its first grade.
- "Again" keeps the item due immediately (interval 0) rather than FSRS's
  next-day lapse interval, preserving the app's "stays due until you get it
  right" behaviour. Stability/difficulty still update per FSRS.
- Rows scheduled by the old SM-2 code are migrated by replaying their
  ReviewLog history (``replay``); the legacy ease/interval fields remain on
  ``Revision`` but no longer drive scheduling.
"""

from collections.abc import Iterable
from datetime import datetime, timezone
from typing import Optional, TypedDict

from fsrs import Card, Rating, Scheduler, State

from .utils import utcnow

RATING: dict[str, Rating] = {
    "Again": Rating.Again,
    "Hard": Rating.Hard,
    "Good": Rating.Good,
    "Easy": Rating.Easy,
}
VALID_GRADES = set(RATING)

# Fraction of items the scheduler aims to have still remembered when they come
# due. Lower = longer intervals / fewer reviews, higher = the opposite.
DESIRED_RETENTION = 0.9

_scheduler = Scheduler(
    desired_retention=DESIRED_RETENTION,
    learning_steps=(),
    relearning_steps=(),
    enable_fuzzing=False,
)


class SrsResult(TypedDict):
    stability: float
    difficulty: float
    interval_days: int
    due_at: datetime


def _aware(dt: datetime) -> datetime:
    """py-fsrs requires tz-aware UTC datetimes; the app stores naive UTC."""
    return dt.replace(tzinfo=timezone.utc)


def _card(
    stability: Optional[float],
    difficulty: Optional[float],
    last_reviewed_at: Optional[datetime],
) -> Card:
    if stability is None or difficulty is None or last_reviewed_at is None:
        return Card()  # no FSRS state yet -> first review
    return Card(
        state=State.Review,
        stability=stability,
        difficulty=difficulty,
        last_review=_aware(last_reviewed_at),
    )


def schedule(
    stability: Optional[float],
    difficulty: Optional[float],
    last_reviewed_at: Optional[datetime],
    grade: str,
    now: Optional[datetime] = None,
) -> SrsResult:
    """Apply one review at ``now`` and return the next FSRS state + due date."""
    now = now or utcnow()
    card, _ = _scheduler.review_card(
        _card(stability, difficulty, last_reviewed_at),
        RATING[grade],
        review_datetime=_aware(now),
    )
    if grade == "Again":
        interval_days, due_at = 0, now
    else:
        interval_days = (card.due - _aware(now)).days
        due_at = card.due.replace(tzinfo=None)
    return SrsResult(
        stability=card.stability,
        difficulty=card.difficulty,
        interval_days=interval_days,
        due_at=due_at,
    )


def replay(
    history: Iterable[tuple[str, datetime]],
) -> tuple[Optional[float], Optional[float]]:
    """Rebuild (stability, difficulty) from a chronological (grade, reviewed_at)
    log. Migrates rows scheduled by the old SM-2 code on their next grade."""
    card = Card()
    reviewed = False
    for grade, reviewed_at in history:
        card, _ = _scheduler.review_card(
            card, RATING[grade], review_datetime=_aware(reviewed_at)
        )
        reviewed = True
    if not reviewed:
        return None, None
    return card.stability, card.difficulty


def preview_intervals(
    stability: Optional[float],
    difficulty: Optional[float],
    last_reviewed_at: Optional[datetime],
    now: Optional[datetime] = None,
) -> dict[str, int]:
    """Days until next due per grade — powers the grade-button hints."""
    now = now or utcnow()
    return {
        grade: schedule(stability, difficulty, last_reviewed_at, grade, now)[
            "interval_days"
        ]
        for grade in RATING
    }
