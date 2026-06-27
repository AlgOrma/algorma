from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..models import Problem, ReviewLog
from ..utils import utcnow

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("")
def get_stats(session: Session = Depends(get_session)):
    """Dashboard summary cards: solved, due, streak, retention."""
    now = utcnow()
    start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_today = start_of_today + timedelta(days=1)
    week_ago = now - timedelta(days=7)

    problems = session.exec(select(Problem)).all()
    total_solved = sum(1 for p in problems if p.status == "Done")
    solved_this_week = sum(
        1 for p in problems if p.status == "Done" and p.updated_at >= week_ago
    )
    due_today = sum(
        1 for p in problems if p.due_at and start_of_today <= p.due_at < end_of_today
    )
    overdue = sum(1 for p in problems if p.due_at and p.due_at < start_of_today)

    logs = session.exec(select(ReviewLog).order_by(ReviewLog.reviewed_at.desc())).all()
    review_days = {log.reviewed_at.date() for log in logs}

    # Current streak: consecutive days ending today (or yesterday if today is empty).
    streak_days = 0
    cursor = start_of_today.date()
    if cursor not in review_days:
        cursor -= timedelta(days=1)
    while cursor in review_days:
        streak_days += 1
        cursor -= timedelta(days=1)

    # Best streak: longest run of consecutive review days ever.
    best_streak_days = 0
    run = 0
    prev: date | None = None
    for day in sorted(review_days):
        run = run + 1 if prev is not None and (day - prev).days == 1 else 1
        best_streak_days = max(best_streak_days, run)
        prev = day

    # Retention: share of Good/Easy among the last 60 reviews.
    recent = logs[:60]
    recalled = sum(1 for log in recent if log.grade in ("Good", "Easy"))
    retention_pct = round(recalled / len(recent) * 100) if recent else 0

    return {
        "totalSolved": total_solved,
        "solvedThisWeek": solved_this_week,
        "dueToday": due_today,
        "overdue": overdue,
        "streakDays": streak_days,
        "bestStreakDays": best_streak_days,
        "retentionPct": retention_pct,
    }
