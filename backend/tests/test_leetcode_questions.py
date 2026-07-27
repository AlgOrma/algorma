"""LeetCode catalog endpoints: search/filter/pagination, detail, and import."""

import json

import pytest
from sqlmodel import select

from app.models import (
    Curriculum,
    CurriculumQuestionLink,
    LeetCodeQuestion,
    Problem,
    Revision,
    User,
)


def make_question(
    session,
    id,
    title,
    difficulty="Easy",
    tags=("Array",),
    paid=False,
    statement="",
):
    q = LeetCodeQuestion(
        id=id,
        question_id=id,
        title=title,
        difficulty=difficulty,
        statement=statement,
        leetcode_url=f"https://leetcode.com/problems/q{id}/",
        topic_tags=json.dumps(list(tags)),
        is_paid_only=paid,
    )
    session.add(q)
    session.commit()
    return q


def seed_catalog(session):
    """Five questions with varied ids/titles/difficulties/tags."""
    make_question(session, "1", "Two Sum", "Easy", ["Array", "Hash Table"])
    make_question(
        session, "2", "Add Two Numbers", "Medium", ["Linked List", "Math"],
        statement="You are given two non-empty linked lists.",
    )
    make_question(
        session, "3", "Longest Substring", "Medium",
        ["Hash Table", "String", "Sliding Window"],
    )
    make_question(
        session, "4", "Median of Two Sorted Arrays", "Hard",
        ["Array", "Binary Search"], paid=True,
    )
    make_question(
        session, "10", "Regular Expression Matching", "Hard",
        ["String", "Dynamic Programming"],
    )


def make_curriculum(
    session, question_ids, slug="blind-75", name="Blind 75", user_id=None
):
    """A curriculum with the given questions linked. ``user_id=None`` makes it
    global (readable by everyone); passing an owner makes it private."""
    cur = Curriculum(name=name, slug=slug, user_id=user_id)
    session.add(cur)
    session.commit()
    for qid in question_ids:
        session.add(CurriculumQuestionLink(curriculum_id=cur.id, leetcode_id=qid))
    session.commit()
    session.refresh(cur)
    return cur


def titles(body):
    return [item["title"] for item in body["items"]]


@pytest.fixture
def other_user(session):
    u = User(name="Other User")
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


@pytest.fixture
def anon_client(client):
    """The shared ``client`` presets an ``X-User-Id`` header; this one sends no
    such header at all, which is the request the catalog leak allowed. Distinct
    from sending an empty value: only a truly absent header proves the endpoint
    treats "anonymous" as a real case rather than a falsy-string accident."""
    client.headers.pop("X-User-Id", None)
    return client


# --- listing / search ---


def test_empty_catalog_lists_nothing(client):
    body = client.get("/api/leetcode-questions").json()

    assert body == {"items": [], "total": 0, "page": 1, "limit": 50, "pages": 0}


def test_list_orders_ids_numerically(client, session):
    seed_catalog(session)

    body = client.get("/api/leetcode-questions").json()

    # "10" sorts after the single-digit ids, not between "1" and "2".
    assert [x["id"] for x in body["items"]] == ["1", "2", "3", "4", "10"]
    assert body["total"] == 5


def test_search_matches_title_substring_with_prefix_ranked_first(client, session):
    seed_catalog(session)
    # Prefix match with a HIGHER id than the mid-title matches, so relevance
    # ranking is distinguishable from the default numeric-id ordering.
    make_question(session, "1029", "Two City Scheduling", "Medium", ["Array"])

    body = client.get("/api/leetcode-questions", params={"q": "two"}).json()

    # Both prefix matches outrank the mid-title matches; ties keep id order.
    assert titles(body) == [
        "Two Sum",
        "Two City Scheduling",
        "Add Two Numbers",
        "Median of Two Sorted Arrays",
    ]
    assert body["total"] == 4


def test_search_matches_statement_text(client, session):
    seed_catalog(session)

    body = client.get("/api/leetcode-questions", params={"q": "non-empty"}).json()

    assert titles(body) == ["Add Two Numbers"]


def test_numeric_search_matches_question_number_exactly(client, session):
    seed_catalog(session)

    body = client.get("/api/leetcode-questions", params={"q": "1"}).json()

    assert [x["id"] for x in body["items"]] == ["1"]


def test_search_with_no_hits_is_empty(client, session):
    seed_catalog(session)

    body = client.get("/api/leetcode-questions", params={"q": "zzzz"}).json()

    assert body["items"] == []
    assert body["total"] == 0
    assert body["pages"] == 0


# --- filters ---


def test_difficulty_filter(client, session):
    seed_catalog(session)

    body = client.get(
        "/api/leetcode-questions", params={"difficulty": "Hard"}
    ).json()

    assert titles(body) == ["Median of Two Sorted Arrays", "Regular Expression Matching"]
    assert all(x["difficulty"] == "Hard" for x in body["items"])


def test_difficulty_all_is_a_no_op(client, session):
    seed_catalog(session)

    body = client.get("/api/leetcode-questions", params={"difficulty": "All"}).json()

    assert body["total"] == 5


def test_tag_filter_matches_json_tag_list(client, session):
    seed_catalog(session)

    body = client.get("/api/leetcode-questions", params={"tag": "Array"}).json()

    assert [x["id"] for x in body["items"]] == ["1", "4"]
    assert all("Array" in x["topicTags"] for x in body["items"])


def test_tag_and_curriculum_all_are_no_ops(client, session):
    # The frontend dropdowns default to "All"; neither filter may kick in
    # (a literal tag match on "All" would return an empty catalog).
    seed_catalog(session)

    body = client.get(
        "/api/leetcode-questions", params={"tag": "All", "curriculum": "All"}
    ).json()

    assert body["total"] == 5


def test_curriculum_filter_by_slug_and_id(client, session):
    seed_catalog(session)
    cur = make_curriculum(session, ["1", "3"])

    by_slug = client.get(
        "/api/leetcode-questions", params={"curriculum": "blind-75"}
    ).json()
    by_id = client.get(
        "/api/leetcode-questions", params={"curriculum": cur.id}
    ).json()

    assert [x["id"] for x in by_slug["items"]] == ["1", "3"]
    assert by_slug["total"] == 2
    assert by_id["items"] == by_slug["items"]


def test_unknown_curriculum_filter_is_ignored(client, session):
    # Current behavior: a curriculum slug that matches nothing adds no
    # condition, so the full catalog comes back rather than an empty page.
    seed_catalog(session)

    body = client.get(
        "/api/leetcode-questions", params={"curriculum": "no-such-list"}
    ).json()

    assert body["total"] == 5


def test_filters_combine(client, session):
    seed_catalog(session)
    make_curriculum(session, ["1", "4", "10"])

    body = client.get(
        "/api/leetcode-questions",
        params={"curriculum": "blind-75", "difficulty": "Hard", "tag": "Array"},
    ).json()

    assert [x["id"] for x in body["items"]] == ["4"]
    assert body["total"] == 1


# --- curriculum filter ownership ---
#
# Same readability rule as GET /api/curriculums/{id_or_slug}: global lists are
# visible to everyone, private ones only to their owner. Without it, filtering
# the catalog by a guessed slug leaks another user's private list membership.
#
# These drive the real app rather than calling the handler directly, so the
# Depends(get_current_user_optional) wiring is itself under test: deleting it
# from the signature must fail these.


def seed_private(session, owner):
    seed_catalog(session)
    return make_curriculum(
        session, ["2"], slug="my-plan", name="My Plan", user_id=owner.id
    )


def test_global_curriculum_filter_readable_by_anyone(client, anon_client, session):
    seed_catalog(session)
    make_curriculum(session, ["1"])

    # Signed-in and anonymous callers both see a global list's contents.
    for c in (client, anon_client):
        res = c.get("/api/leetcode-questions", params={"curriculum": "blind-75"})
        assert res.status_code == 200
        assert [x["id"] for x in res.json()["items"]] == ["1"]


def test_owner_may_filter_by_private_curriculum(client, session, user):
    cur = seed_private(session, user)

    # By slug and by id alike — both resolve to the same curriculum.
    for key in (cur.slug, cur.id):
        res = client.get("/api/leetcode-questions", params={"curriculum": key})
        assert res.status_code == 200
        assert [x["id"] for x in res.json()["items"]] == ["2"]


def test_stranger_is_denied_private_curriculum(client, session, user, other_user):
    cur = seed_private(session, user)

    for key in (cur.slug, cur.id):
        res = client.get(
            "/api/leetcode-questions",
            params={"curriculum": key},
            headers={"X-User-Id": other_user.id},
        )
        assert res.status_code == 403
        assert res.json()["detail"] == "Access denied"


def test_anonymous_is_denied_private_curriculum(anon_client, session, user):
    cur = seed_private(session, user)

    res = anon_client.get(
        "/api/leetcode-questions", params={"curriculum": cur.slug}
    )
    assert res.status_code == 403


def test_anonymous_browsing_still_works(anon_client, session, user):
    seed_private(session, user)
    make_curriculum(session, ["1"])

    # Catalog browsing stays public: unfiltered, and filtered by a global list.
    assert anon_client.get("/api/leetcode-questions").status_code == 200

    res = anon_client.get(
        "/api/leetcode-questions", params={"curriculum": "blind-75"}
    )
    assert res.status_code == 200
    assert [x["id"] for x in res.json()["items"]] == ["1"]


def test_unknown_user_id_is_rejected(client, session, user):
    seed_private(session, user)

    # A header naming a nonexistent profile is an error, not silent anonymity —
    # a stale client id fails loudly rather than downgrading to anonymous.
    res = client.get(
        "/api/leetcode-questions", headers={"X-User-Id": "no-such-profile"}
    )
    assert res.status_code == 404


def test_empty_user_id_header_is_anonymous(client, session, user):
    seed_private(session, user)

    # An empty header is absent, not a bogus id — public browsing still works.
    res = client.get("/api/leetcode-questions", headers={"X-User-Id": ""})
    assert res.status_code == 200


# --- pagination ---


def test_pagination_slices_and_reports_totals(client, session):
    seed_catalog(session)

    page1 = client.get(
        "/api/leetcode-questions", params={"page": 1, "limit": 2}
    ).json()
    page3 = client.get(
        "/api/leetcode-questions", params={"page": 3, "limit": 2}
    ).json()

    assert [x["id"] for x in page1["items"]] == ["1", "2"]
    assert page1 | {"items": None} == {
        "items": None, "total": 5, "page": 1, "limit": 2, "pages": 3,
    }
    assert [x["id"] for x in page3["items"]] == ["10"]
    assert page3["page"] == 3


def test_page_past_the_end_is_empty_but_keeps_total(client, session):
    seed_catalog(session)

    body = client.get(
        "/api/leetcode-questions", params={"page": 9, "limit": 2}
    ).json()

    assert body["items"] == []
    assert body["total"] == 5
    assert body["pages"] == 3


def test_page_and_limit_bounds_are_validated(client, session):
    seed_catalog(session)

    assert client.get("/api/leetcode-questions", params={"page": 0}).status_code == 422
    assert (
        client.get("/api/leetcode-questions", params={"limit": 101}).status_code == 422
    )


# --- detail ---


def test_get_question_returns_full_camelcase_shape(client, session):
    seed_catalog(session)

    res = client.get("/api/leetcode-questions/4")

    assert res.status_code == 200
    body = res.json()
    assert body["id"] == "4"
    assert body["questionId"] == "4"
    assert body["title"] == "Median of Two Sorted Arrays"
    assert body["difficulty"] == "Hard"
    assert body["topicTags"] == ["Array", "Binary Search"]
    assert body["isPaidOnly"] is True
    assert body["leetcodeUrl"] == "https://leetcode.com/problems/q4/"
    assert body["hints"] == []
    assert body["similarQuestions"] == []
    assert body["stats"] == {}


def test_get_unknown_question_is_404(client, session):
    seed_catalog(session)

    res = client.get("/api/leetcode-questions/999")

    assert res.status_code == 404
    assert res.json()["detail"] == "Question not found"


# --- import ---


def test_import_creates_problem_for_current_user(client, session, user, topic):
    seed_catalog(session)

    res = client.post("/api/leetcode-questions/2/import")

    assert res.status_code == 201
    body = res.json()
    assert body["title"] == "2. Add Two Numbers"
    assert body["difficulty"] == "Medium"
    assert body["status"] == "Not started"
    assert body["statement"] == "You are given two non-empty linked lists."
    assert body["leetcodeUrl"] == "https://leetcode.com/problems/q2/"
    assert body["leetcodeId"] == "2"
    # No tag maps to a known topic, so the first tag becomes the topic name.
    assert body["topic"] == "Linked List"
    # Fresh import: never reviewed, due immediately.
    assert body["revisions"] == 0
    assert body["due"] is True

    problem = session.exec(select(Problem).where(Problem.leetcode_id == "2")).one()
    assert problem.user_id == user.id
    revision = session.exec(
        select(Revision).where(Revision.problem_id == problem.id)
    ).one()
    assert revision.user_id == user.id
    assert revision.interval_days == 0


def test_import_maps_known_tag_to_existing_topic(client, session, user, topic):
    # "Array" maps to the seeded "Arrays" topic — reused, not duplicated.
    seed_catalog(session)

    body = client.post("/api/leetcode-questions/1/import").json()

    assert body["topic"] == "Arrays"
    problem = session.exec(select(Problem).where(Problem.leetcode_id == "1")).one()
    assert problem.topic_id == topic.id


def test_import_with_no_tags_falls_back_to_general(client, session, user):
    make_question(session, "77", "Mystery", tags=[])

    body = client.post("/api/leetcode-questions/77/import").json()

    assert body["topic"] == "General"


def test_import_title_cases_unknown_lowercase_tag(client, session, user):
    # Unknown tag that isn't already Title Case gets title-cased for the topic.
    make_question(session, "78", "Subsets", tags=["divide and conquer"])

    body = client.post("/api/leetcode-questions/78/import").json()

    assert body["topic"] == "Divide And Conquer"


def test_second_import_of_same_question_is_400(client, session, user):
    seed_catalog(session)
    assert client.post("/api/leetcode-questions/1/import").status_code == 201

    res = client.post("/api/leetcode-questions/1/import")

    assert res.status_code == 400
    assert res.json()["detail"] == "Question already imported to your list"
    problems = session.exec(select(Problem).where(Problem.user_id == user.id)).all()
    assert len(problems) == 1


def test_other_user_can_import_the_same_question(client, session, user):
    seed_catalog(session)
    client.post("/api/leetcode-questions/1/import")
    other = User(name="Other")
    session.add(other)
    session.commit()

    res = client.post(
        "/api/leetcode-questions/1/import", headers={"X-User-Id": other.id}
    )

    assert res.status_code == 201
    owners = {
        p.user_id
        for p in session.exec(select(Problem).where(Problem.leetcode_id == "1")).all()
    }
    assert owners == {user.id, other.id}


def test_import_unknown_question_is_404(client, session, user):
    seed_catalog(session)

    res = client.post("/api/leetcode-questions/999/import")

    assert res.status_code == 404
    assert res.json()["detail"] == "Question not found"


def test_import_without_user_header_is_400(client, session):
    seed_catalog(session)

    res = client.post("/api/leetcode-questions/1/import", headers={"X-User-Id": ""})

    assert res.status_code == 400
    assert "X-User-Id" in res.json()["detail"]
