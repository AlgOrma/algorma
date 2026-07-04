"""FSRS scheduling unit tests (pure functions, no database)."""

from datetime import datetime, timedelta

from app.srs import VALID_GRADES, preview_intervals, replay, schedule

NOW = datetime(2026, 7, 4, 12, 0, 0)


def test_first_review_good_schedules_forward():
    result = schedule(None, None, None, "Good", NOW)
    assert result["stability"] > 0
    assert result["difficulty"] > 0
    assert result["interval_days"] >= 1
    assert result["due_at"] == NOW + timedelta(days=result["interval_days"])


def test_again_stays_due_immediately():
    first = schedule(None, None, None, "Good", NOW)
    later = NOW + timedelta(days=first["interval_days"])
    lapse = schedule(
        first["stability"], first["difficulty"], NOW, "Again", later
    )
    assert lapse["interval_days"] == 0
    assert lapse["due_at"] == later
    # The lapse still updates FSRS state: stability drops, difficulty rises.
    assert lapse["stability"] < first["stability"]
    assert lapse["difficulty"] > first["difficulty"]


def test_intervals_ordered_by_grade():
    last = NOW - timedelta(days=18)
    intervals = preview_intervals(20.0, 5.0, last, NOW)
    assert intervals["Again"] == 0
    assert 1 <= intervals["Hard"] <= intervals["Good"] <= intervals["Easy"]


def test_preview_covers_every_grade():
    assert set(preview_intervals(None, None, None, NOW)) == VALID_GRADES


def test_replay_empty_history_has_no_state():
    assert replay([]) == (None, None)


def test_replay_matches_step_by_step_scheduling():
    history = [
        ("Good", NOW),
        ("Good", NOW + timedelta(days=2)),
        ("Again", NOW + timedelta(days=10)),
    ]
    stability, difficulty = replay(history)

    s = d = last = None
    for grade, at in history:
        result = schedule(s, d, last, grade, at)
        s, d, last = result["stability"], result["difficulty"], at

    assert stability == s
    assert difficulty == d
