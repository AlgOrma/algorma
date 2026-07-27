"""Serializer unit tests: the exact camelCase shapes emitted by app/serialize.py.

Each public serializer gets at least one full exact-dict assertion (not just key
presence), plus the interesting branches: JSON-string columns decoded, missing
revision → SRS defaults, display labels (created / lastRevised / nextLabel /
dueMeta / nextColor), approach ordering + legacy fallback, and "Z"-suffixed ISO
datetimes. The catalog/curriculum/review-log shapes are emitted inline by their
routers, so they're covered by the HTTP tests instead.
"""

import json
from datetime import datetime, timedelta

from app.models import (
    Flashcard,
    LeetCodeQuestion,
    Pattern,
    Problem,
    ProblemApproach,
    Revision,
    TemplatePattern,
    TemplateVariation,
    User,
)
from app.serialize import (
    serialize_flashcard,
    serialize_problem,
    serialize_template_pattern,
    serialize_user,
)
from app.srs import preview_intervals

NOW = datetime(2026, 7, 10, 12, 0, 0)


def make_problem(session, user, topic, **overrides):
    fields = dict(
        user_id=user.id,
        title="Two Sum",
        topic_id=topic.id,
        difficulty="Easy",
        created_at=NOW - timedelta(days=3),
        updated_at=NOW - timedelta(days=1),
    )
    fields.update(overrides)
    p = Problem(**fields)
    session.add(p)
    session.commit()
    session.refresh(p)
    return p


def make_revision(session, user, problem, **overrides):
    fields = dict(user_id=user.id, problem_id=problem.id)
    fields.update(overrides)
    r = Revision(**fields)
    session.add(r)
    session.commit()
    session.refresh(r)
    return r


def make_question(**overrides):
    fields = dict(
        id="1",
        question_id="1",
        title="Two Sum",
        difficulty="Easy",
        leetcode_url="https://leetcode.com/problems/two-sum/",
    )
    fields.update(overrides)
    return LeetCodeQuestion(**fields)


# --- serialize_user ---------------------------------------------------------


def test_user_serializes_every_field_camel_case():
    u = User(
        id="u1",
        name="Ada",
        email="ada@example.com",
        timezone="Asia/Kolkata",
        daily_goal=25,
        bio="loves arrays",
        leetcode_username="ada_lovelace",
        created_at=datetime(2026, 7, 1, 8, 30, 0),
        updated_at=datetime(2026, 7, 2, 9, 0, 0),
    )
    assert serialize_user(u) == {
        "id": "u1",
        "name": "Ada",
        "email": "ada@example.com",
        "timezone": "Asia/Kolkata",
        "dailyGoal": 25,
        "bio": "loves arrays",
        "leetcodeUsername": "ada_lovelace",
        "createdAt": "2026-07-01T08:30:00Z",
        "updatedAt": "2026-07-02T09:00:00Z",
    }


def test_user_optional_fields_serialize_as_none_and_defaults():
    u = User(
        id="u2",
        name="Bare",
        created_at=datetime(2026, 7, 1),
        updated_at=datetime(2026, 7, 1),
    )
    out = serialize_user(u)
    assert out["email"] is None
    assert out["bio"] is None
    assert out["timezone"] == "UTC"
    assert out["dailyGoal"] == 10


# --- serialize_problem ------------------------------------------------------


def test_problem_full_shape_with_revision_patterns_and_leetcode(session, user, topic):
    lc = make_question(
        id="1",
        likes=999,
        dislikes=42,
        category_title="Algorithms",
        hints=json.dumps(["Use a hash map"]),
        similar_questions=json.dumps([{"title": "3Sum", "titleSlug": "3sum"}]),
        stats=json.dumps({"acRate": "50.0%", "totalAccepted": "1M"}),
        solution_content="## Editorial",
        has_solution=True,
    )
    pattern = Pattern(name="Hash Map")
    session.add(lc)
    session.add(pattern)
    session.commit()

    p = make_problem(
        session,
        user,
        topic,
        status="Done",
        statement="Find two numbers that add to target.",
        example_input="[2,7,11,15], 9",
        example_output="[0,1]",
        approach="Hash map lookup",
        solution="def two_sum(): ...",
        notes="classic",
        checklist_progress=json.dumps([True, False, True]),
        leetcode_url="https://leetcode.com/problems/two-sum/",
        leetcode_id="1",
    )
    p.patterns.append(pattern)
    a1 = ProblemApproach(
        problem_id=p.id,
        name="Brute force",
        complexity_time="O(n^2)",
        complexity_space="O(1)",
        approach="Try all pairs",
        code="for i in ...",
        language="Python",
        position=0,
    )
    a2 = ProblemApproach(
        problem_id=p.id,
        name="Hash map",
        complexity_time="O(n)",
        complexity_space="O(n)",
        approach="One pass",
        code="seen = {}",
        language="Go",
        position=1,
    )
    session.add(a1)
    session.add(a2)
    session.commit()
    session.refresh(p)

    last_reviewed = NOW - timedelta(days=1)
    rev = make_revision(
        session,
        user,
        p,
        review_count=2,
        last_reviewed_at=last_reviewed,
        due_at=NOW + timedelta(days=4),
        ease_factor=2.4,
        interval_days=5,
        repetitions=2,
        stability=5.0,
        difficulty=6.0,
    )

    assert serialize_problem(p, rev, NOW) == {
        "id": p.id,
        "title": "Two Sum",
        "topic": "Arrays",
        "difficulty": "Easy",
        "status": "Done",
        "due": False,
        "statement": "Find two numbers that add to target.",
        "exIn": "[2,7,11,15], 9",
        "exOut": "[0,1]",
        "approach": "Hash map lookup",
        "solution": "def two_sum(): ...",
        "notes": "classic",
        "checklistProgress": [True, False, True],
        "patterns": ["Hash Map"],
        "created": "3d ago",
        "lastRevised": "1d ago · 2×",
        "nextLabel": "in 4d",
        "nextColor": "var(--color-text-muted)",
        "dueMeta": "revised 1d ago · 2×",
        "revisions": 2,
        "approaches": [
            {
                "id": a1.id,
                "name": "Brute force",
                "complexityTime": "O(n^2)",
                "complexitySpace": "O(1)",
                "approach": "Try all pairs",
                "code": "for i in ...",
                "lang": "Python",
                "position": 0,
            },
            {
                "id": a2.id,
                "name": "Hash map",
                "complexityTime": "O(n)",
                "complexitySpace": "O(n)",
                "approach": "One pass",
                "code": "seen = {}",
                "lang": "Go",
                "position": 1,
            },
        ],
        "hints": ["Use a hash map"],
        "solutionContent": "## Editorial",
        "hasSolution": True,
        "similarQuestions": [{"title": "3Sum", "titleSlug": "3sum"}],
        "stats": {"acRate": "50.0%", "totalAccepted": "1M"},
        "likes": 999,
        "dislikes": 42,
        "categoryTitle": "Algorithms",
        "leetcodeId": "1",
        "topicSlug": "arrays",
        "leetcodeUrl": "https://leetcode.com/problems/two-sum/",
        "easeFactor": 2.4,
        "intervalDays": 5,
        "repetitions": 2,
        "reviewCount": 2,
        "srsStability": 5.0,
        "srsDifficulty": 6.0,
        "nextIntervals": preview_intervals(5.0, 6.0, last_reviewed, NOW),
        "createdAt": "2026-07-07T12:00:00Z",
        "updatedAt": "2026-07-09T12:00:00Z",
        "lastReviewedAt": "2026-07-09T12:00:00Z",
        "dueAt": "2026-07-14T12:00:00Z",
        "customListIds": [],
    }


def test_problem_without_revision_uses_srs_defaults(session, user, topic):
    p = make_problem(session, user, topic, status="Solving", created_at=NOW, updated_at=NOW)

    out = serialize_problem(p, None, NOW)

    assert out["due"] is False
    assert out["created"] == "today"
    assert out["lastRevised"] == "—"
    assert out["nextLabel"] == "—"
    assert out["nextColor"] == "var(--color-border-accent)"
    assert out["dueMeta"] == "in progress"
    assert out["revisions"] == 0
    assert out["easeFactor"] == 2.5
    assert out["intervalDays"] == 0
    assert out["repetitions"] == 0
    assert out["reviewCount"] == 0
    assert out["srsStability"] is None
    assert out["srsDifficulty"] is None
    assert out["nextIntervals"] == preview_intervals(None, None, None, NOW)
    assert out["lastReviewedAt"] is None
    assert out["dueAt"] is None
    assert out["checklistProgress"] is None
    assert out["patterns"] == []
    assert out["approaches"] == []
    # No linked LeetCode question → catalog fields fall back to empty values.
    assert out["hints"] == []
    assert out["similarQuestions"] == []
    assert out["stats"] == {}
    assert out["likes"] == 0
    assert out["dislikes"] == 0
    assert out["categoryTitle"] == "Algorithms"
    assert out["leetcodeId"] is None
    assert out["solutionContent"] is None
    assert out["hasSolution"] is False


def test_problem_due_meta_maps_status_when_never_reviewed(session, user, topic):
    for status, meta in [
        ("Not started", "not started"),
        ("Solving", "in progress"),
        ("Done", "completed"),
    ]:
        p = make_problem(session, user, topic, status=status)
        assert serialize_problem(p, None, NOW)["dueMeta"] == meta


def test_problem_overdue_labels(session, user, topic):
    p = make_problem(session, user, topic)
    rev = make_revision(
        session,
        user,
        p,
        review_count=1,
        last_reviewed_at=NOW - timedelta(days=5),
        due_at=NOW - timedelta(days=2),
        stability=3.0,
        difficulty=5.0,
    )

    out = serialize_problem(p, rev, NOW)

    assert out["due"] is True
    assert out["nextLabel"] == "-2d"
    assert out["nextColor"] == "var(--color-accent-red-hover)"
    assert out["dueMeta"] == "overdue 2d"
    assert out["lastRevised"] == "5d ago · 1×"


def test_problem_due_today_labels(session, user, topic):
    p = make_problem(session, user, topic)
    rev = make_revision(
        session,
        user,
        p,
        review_count=1,
        last_reviewed_at=NOW - timedelta(days=3),
        due_at=NOW,
        stability=3.0,
        difficulty=5.0,
    )

    out = serialize_problem(p, rev, NOW)

    assert out["due"] is True
    assert out["nextLabel"] == "today"
    assert out["nextColor"] == "var(--color-accent)"
    assert out["dueMeta"] == "revised 3d ago · 1×"


def test_problem_fractional_day_deltas_round_to_nearest_day(session, user, topic):
    # Day deltas use round(), not truncation: due 6h ago is still "today" (not
    # overdue), and due in 14h is tomorrow (not due yet). A regression to
    # timedelta.days-style flooring would flip both.
    p1 = make_problem(session, user, topic)
    rev1 = make_revision(
        session,
        user,
        p1,
        review_count=1,
        last_reviewed_at=NOW - timedelta(days=3),
        due_at=NOW - timedelta(hours=6),
        stability=3.0,
        difficulty=5.0,
    )
    out1 = serialize_problem(p1, rev1, NOW)
    assert out1["due"] is True
    assert out1["nextLabel"] == "today"
    assert out1["nextColor"] == "var(--color-accent)"
    assert out1["dueMeta"] == "revised 3d ago · 1×"

    p2 = make_problem(session, user, topic, title="Later")
    rev2 = make_revision(
        session,
        user,
        p2,
        review_count=1,
        last_reviewed_at=NOW - timedelta(days=1),
        due_at=NOW + timedelta(hours=14),
        stability=3.0,
        difficulty=5.0,
    )
    out2 = serialize_problem(p2, rev2, NOW)
    assert out2["due"] is False
    assert out2["nextLabel"] == "in 1d"
    assert out2["nextColor"] == "var(--color-text-muted)"


def test_problem_legacy_sm2_revision_skips_next_intervals(session, user, topic):
    p = make_problem(session, user, topic)
    rev = make_revision(
        session,
        user,
        p,
        algo="sm2",
        review_count=3,
        last_reviewed_at=NOW - timedelta(days=2),
        due_at=NOW + timedelta(days=6),
        ease_factor=2.6,
        interval_days=8,
        repetitions=3,
        stability=None,
        difficulty=None,
    )

    out = serialize_problem(p, rev, NOW)

    assert out["nextIntervals"] is None
    assert out["srsStability"] is None
    assert out["easeFactor"] == 2.6


def test_problem_falls_back_to_default_approach_entry(session, user, topic):
    p = make_problem(session, user, topic, approach="Sort first", solution=None)

    out = serialize_problem(p, None, NOW)

    assert out["approaches"] == [
        {
            "id": "default",
            "name": "Default Approach",
            "complexityTime": "",
            "complexitySpace": "",
            "approach": "Sort first",
            "code": "",
            "lang": "Python",
            "position": 0,
        }
    ]


def test_problem_approaches_sorted_by_position_not_insertion_order():
    # Detached instances: the relationship list keeps insertion order, so the
    # serializer's own sort is what produces position order here.
    p = Problem(
        user_id="u",
        title="T",
        topic_id="t",
        difficulty="Easy",
        created_at=NOW,
        updated_at=NOW,
    )
    p.approaches = [
        ProblemApproach(id="b", problem_id="x", name="second", position=1),
        ProblemApproach(id="a", problem_id="x", name="first", position=0),
    ]

    out = serialize_problem(p, None, NOW)

    assert [a["id"] for a in out["approaches"]] == ["a", "b"]
    assert [a["position"] for a in out["approaches"]] == [0, 1]


# --- serialize_template_pattern ----------------------------------------------


def test_template_pattern_remaps_desc_lang_and_sorts_variations():
    pattern = TemplatePattern(
        id="tp1",
        user_id="u1",
        name="Sliding Window",
        topic="Arrays",
        description="Use for contiguous ranges",
    )
    pattern.variations = [
        TemplateVariation(
            id="v2",
            pattern_id="tp1",
            name="Variable size",
            description="grow/shrink",
            language="Go",
            code="for r := range ...",
            position=1,
        ),
        TemplateVariation(
            id="v1",
            pattern_id="tp1",
            name="Fixed size",
            description="window of k",
            language="Python",
            code="for r in range(len(a)):",
            position=0,
        ),
    ]

    assert serialize_template_pattern(pattern) == {
        "id": "tp1",
        "name": "Sliding Window",
        "topic": "Arrays",
        "description": "Use for contiguous ranges",
        "variations": [
            {
                "id": "v1",
                "name": "Fixed size",
                "desc": "window of k",
                "lang": "Python",
                "code": "for r in range(len(a)):",
            },
            {
                "id": "v2",
                "name": "Variable size",
                "desc": "grow/shrink",
                "lang": "Go",
                "code": "for r := range ...",
            },
        ],
    }


def test_template_pattern_with_no_variations_serializes_empty_list():
    pattern = TemplatePattern(id="tp2", user_id="u1", name="Empty")
    out = serialize_template_pattern(pattern)
    assert out["variations"] == []
    assert out["topic"] == ""
    assert out["description"] == ""


# --- serialize_flashcard -----------------------------------------------------


def test_flashcard_without_revision_exact_defaults():
    card = Flashcard(
        id="f1",
        user_id="u1",
        type="concept",
        tag="arrays",
        front="What is a heap?",
        back="A tree-based priority structure.",
    )
    assert serialize_flashcard(card, None, NOW) == {
        "id": "f1",
        "type": "concept",
        "tag": "arrays",
        "front": "What is a heap?",
        "back": "A tree-based priority structure.",
        "due": False,
        "easeFactor": 2.5,
        "intervalDays": 0,
        "repetitions": 0,
        "reviewCount": 0,
        "srsStability": None,
        "srsDifficulty": None,
        "nextIntervals": preview_intervals(None, None, None, NOW),
        "lastReviewedAt": None,
        "dueAt": None,
    }


def test_flashcard_with_overdue_revision(session, user):
    card = Flashcard(
        id="f2",
        user_id=user.id,
        type="problem",
        tag="dp",
        front="Climbing stairs?",
        back="Fibonacci.",
    )
    session.add(card)
    session.commit()
    last_reviewed = NOW - timedelta(days=3)
    rev = Revision(
        user_id=user.id,
        flashcard_id=card.id,
        review_count=4,
        last_reviewed_at=last_reviewed,
        due_at=NOW - timedelta(days=1),
        ease_factor=2.2,
        interval_days=2,
        repetitions=4,
        stability=4.5,
        difficulty=5.5,
    )
    session.add(rev)
    session.commit()

    assert serialize_flashcard(card, rev, NOW) == {
        "id": "f2",
        "type": "problem",
        "tag": "dp",
        "front": "Climbing stairs?",
        "back": "Fibonacci.",
        "due": True,
        "easeFactor": 2.2,
        "intervalDays": 2,
        "repetitions": 4,
        "reviewCount": 4,
        "srsStability": 4.5,
        "srsDifficulty": 5.5,
        "nextIntervals": preview_intervals(4.5, 5.5, last_reviewed, NOW),
        "lastReviewedAt": "2026-07-07T12:00:00Z",
        "dueAt": "2026-07-09T12:00:00Z",
    }


def test_flashcard_due_in_future_is_not_due():
    card = Flashcard(id="f3", user_id="u1", type="concept", tag="t", front="q", back="a")
    rev = Revision(
        user_id="u1",
        flashcard_id="f3",
        review_count=1,
        last_reviewed_at=NOW - timedelta(days=1),
        due_at=NOW + timedelta(days=2),
        stability=2.0,
        difficulty=5.0,
    )
    out = serialize_flashcard(card, rev, NOW)
    assert out["due"] is False
    assert out["dueAt"] == "2026-07-12T12:00:00Z"


def test_flashcard_legacy_sm2_revision_skips_next_intervals():
    card = Flashcard(id="f4", user_id="u1", type="concept", tag="t", front="q", back="a")
    rev = Revision(
        user_id="u1",
        flashcard_id="f4",
        algo="sm2",
        review_count=2,
        last_reviewed_at=NOW - timedelta(days=1),
        due_at=NOW + timedelta(days=3),
        stability=None,
        difficulty=None,
    )
    assert serialize_flashcard(card, rev, NOW)["nextIntervals"] is None
