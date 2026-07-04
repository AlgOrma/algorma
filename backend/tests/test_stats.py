"""Stats endpoints: timezone-aware day bucketing for the heatmap and streaks.

The endpoint functions are called directly (they're plain functions once the
Depends() defaults are supplied), so no HTTP client is needed.
"""

from datetime import timedelta

from app.models import Problem, ReviewLog
from app.routers.stats import get_activity, get_stats
from app.utils import utcnow

# 12:00 UTC two days ago: far from any UTC midnight, so the UTC-bucketed day
# is stable no matter when the test runs.
ANCHOR = (utcnow() - timedelta(days=2)).replace(
    hour=12, minute=0, second=0, microsecond=0
)


def add_review(session, user, at):
    session.add(
        ReviewLog(
            user_id=user.id, grade="Good", interval_days=1,
            ease_factor=2.5, reviewed_at=at,
        )
    )
    session.commit()


def test_activity_buckets_by_utc_when_no_offset(session, user):
    add_review(session, user, ANCHOR)

    result = get_activity(weeks=52, tz_offset=0, user=user, session=session)

    assert result["totalReviews"] == 1
    assert result["days"] == {
        ANCHOR.date().isoformat(): {"reviews": 1, "solves": 0}
    }


def test_activity_buckets_by_local_day_with_offset(session, user):
    add_review(session, user, ANCHOR)

    # +720 min (UTC+12): 12:00 UTC is local midnight of the *next* day.
    result = get_activity(weeks=52, tz_offset=720, user=user, session=session)

    local_day = (ANCHOR + timedelta(minutes=720)).date()
    assert local_day == ANCHOR.date() + timedelta(days=1)
    assert result["days"] == {local_day.isoformat(): {"reviews": 1, "solves": 0}}


def test_activity_counts_solves(session, user, topic):
    problem = Problem(
        user_id=user.id, title="Two Sum", topic_id=topic.id,
        difficulty="Easy", status="Done", solved_at=ANCHOR,
    )
    session.add(problem)
    session.commit()

    result = get_activity(weeks=52, tz_offset=0, user=user, session=session)

    assert result["totalSolves"] == 1
    assert result["days"][ANCHOR.date().isoformat()]["solves"] == 1


def test_activity_range_ends_on_local_today(session, user):
    result = get_activity(weeks=52, tz_offset=0, user=user, session=session)
    assert result["endDate"] == utcnow().date().isoformat()

    # A large eastern offset can push "today" to tomorrow's date.
    shifted = get_activity(weeks=52, tz_offset=840, user=user, session=session)
    expected = (utcnow() + timedelta(minutes=840)).date().isoformat()
    assert shifted["endDate"] == expected


def test_streak_counts_activity_in_local_day(session, user):
    add_review(session, user, utcnow())

    result = get_stats(tz_offset=0, user=user, session=session)

    assert result["streakDays"] == 1
    assert result["bestStreakDays"] == 1
    assert result["retentionPct"] == 100
