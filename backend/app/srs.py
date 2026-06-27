from datetime import datetime, timedelta
from typing import Optional, TypedDict

from .utils import utcnow

# UI grades map onto the classic SM-2 quality scale (0-5).
QUALITY: dict[str, int] = {"Again": 2, "Hard": 3, "Good": 4, "Easy": 5}
VALID_GRADES = set(QUALITY)


class SrsResult(TypedDict):
    ease_factor: float
    interval_days: int
    repetitions: int
    due_at: datetime


def schedule(
    ease_factor: float,
    interval_days: int,
    repetitions: int,
    grade: str,
    now: Optional[datetime] = None,
) -> SrsResult:
    """SM-2 scheduler. Returns the next SRS state + due date for a given grade."""
    now = now or utcnow()
    quality = QUALITY[grade]

    if quality < 3:
        # Lapse ("Again"): reset the streak, surface again within the session.
        repetitions = 0
        interval_days = 0
    else:
        repetitions += 1
        if repetitions == 1:
            interval_days = 1
        elif repetitions == 2:
            interval_days = 6
        else:
            interval_days = round(interval_days * ease_factor)

    # EF drops on Hard, holds on Good, rises on Easy. Floored at 1.3.
    ease_factor = max(
        1.3, ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    )

    return SrsResult(
        ease_factor=ease_factor,
        interval_days=interval_days,
        repetitions=repetitions,
        due_at=now + timedelta(days=interval_days),
    )
