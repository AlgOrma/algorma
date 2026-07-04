from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user
from ..models import Problem, ReviewLog, Revision, User
from ..utils import utcnow

router = APIRouter(prefix="/api/stats", tags=["stats"])

# Timestamps are stored as naive UTC, but "today", streaks, and heatmap cells
# should follow the user's calendar. Clients pass their offset in minutes east
# of UTC (JS: -new Date().getTimezoneOffset()); we shift timestamps by it
# before taking .date(). ±840 = ±14h, the widest real-world offset.
_TZ_OFFSET_QUERY = Query(default=0, alias="tzOffset", ge=-840, le=840)


@router.get("")
def get_stats(
    tz_offset: int = _TZ_OFFSET_QUERY,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Dashboard summary cards: solved, due, streak, retention — for one user."""
    now = utcnow()
    local = timedelta(minutes=tz_offset)
    today = (now + local).date()  # the user's calendar day
    # Local midnight, expressed as the naive-UTC instants stored in the DB.
    start_of_today = datetime.combine(today, time.min) - local
    end_of_today = start_of_today + timedelta(days=1)
    week_ago = now - timedelta(days=7)

    problems = session.exec(
        select(Problem).where(Problem.user_id == user.id)
    ).all()
    total_solved = sum(1 for p in problems if p.status == "Done")
    solved_this_week = sum(
        1
        for p in problems
        if p.status == "Done" and p.solved_at and p.solved_at >= week_ago
    )

    # Due/overdue mirror the dashboard's "cards due" — problem schedules only.
    revisions = session.exec(
        select(Revision).where(Revision.user_id == user.id)
    ).all()
    problem_revs = [r for r in revisions if r.problem_id is not None]
    due_today = sum(
        1 for r in problem_revs if r.due_at and start_of_today <= r.due_at < end_of_today
    )
    overdue = sum(1 for r in problem_revs if r.due_at and r.due_at < start_of_today)

    logs = session.exec(
        select(ReviewLog)
        .where(ReviewLog.user_id == user.id)
        .order_by(ReviewLog.reviewed_at.desc())
    ).all()
    # Streaks count any activity: grading a review or solving a problem.
    activity_days = {(log.reviewed_at + local).date() for log in logs}
    activity_days |= {(p.solved_at + local).date() for p in problems if p.solved_at}

    # Current streak: consecutive days ending today (or yesterday if today is empty).
    streak_days = 0
    cursor = today
    if cursor not in activity_days:
        cursor -= timedelta(days=1)
    while cursor in activity_days:
        streak_days += 1
        cursor -= timedelta(days=1)

    # Best streak: longest run of consecutive activity days ever.
    best_streak_days = 0
    run = 0
    prev: date | None = None
    for day in sorted(activity_days):
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


@router.get("/activity")
def get_activity(
    weeks: int = Query(default=52, ge=1, le=53),
    tz_offset: int = _TZ_OFFSET_QUERY,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Daily activity for the heatmap: per-day counts of problems solved and
    reviews graded, bucketed by the user's local calendar day.

    Covers the last `weeks` weeks, aligned so the range starts on a Sunday and
    the final (current) week ends today — matching the FE's column-per-week grid.
    """
    now = utcnow()
    local = timedelta(minutes=tz_offset)
    today = (now + local).date()
    days_since_sunday = (today.weekday() + 1) % 7  # Mon=0 … Sun=6
    start_day = today - timedelta(days=days_since_sunday, weeks=weeks - 1)
    # Local midnight of the first heatmap day, as a stored naive-UTC instant.
    start = datetime.combine(start_day, time.min) - local

    # Only the timestamps are needed — skip loading full rows.
    reviewed_ats = session.exec(
        select(ReviewLog.reviewed_at).where(
            ReviewLog.user_id == user.id,
            ReviewLog.reviewed_at >= start,
        )
    ).all()
    solved_ats = session.exec(
        select(Problem.solved_at).where(
            Problem.user_id == user.id,
            Problem.solved_at >= start,  # NULL solved_at rows drop out in SQL
        )
    ).all()

    days: dict[str, dict[str, int]] = {}
    for ts in reviewed_ats:
        day = days.setdefault((ts + local).date().isoformat(), {"reviews": 0, "solves": 0})
        day["reviews"] += 1
    for ts in solved_ats:
        day = days.setdefault((ts + local).date().isoformat(), {"reviews": 0, "solves": 0})
        day["solves"] += 1

    return {
        "startDate": start_day.isoformat(),
        "endDate": today.isoformat(),
        "days": days,
        "totalReviews": len(reviewed_ats),
        "totalSolves": len(solved_ats),
    }
