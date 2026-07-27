"""Problems API over HTTP: create, list filters, get, patch, delete, and grading.

Covers topic/pattern resolution on create, the serialized response shape,
solved_at transitions on status changes, checklistProgress round-trips,
approaches replacement, delete cascades (revision + review logs + approaches),
the /review grading endpoint, and per-user isolation.
"""

import json

from sqlmodel import select

from app.models import (
    LeetCodeQuestion,
    Pattern,
    Problem,
    ProblemApproach,
    ReviewLog,
    Revision,
    Topic,
    User,
)


def post_problem(client, headers=None, **overrides):
    payload = {"title": "Two Sum", "topic": "Arrays"}
    payload.update(overrides)
    res = client.post("/api/problems", json=payload, headers=headers)
    assert res.status_code == 201
    return res.json()


def other_user(session):
    other = User(name="Other User")
    session.add(other)
    session.commit()
    session.refresh(other)
    return other


# --- create ---


def test_create_returns_frontend_shape(client):
    body = post_problem(
        client,
        difficulty="Medium",
        statement="Find two numbers adding to target.",
        exIn="[2,7,11,15], 9",
        exOut="[0,1]",
        notes="classic",
        patterns=["Hash Map", "Two Pointers"],
        leetcodeUrl="https://leetcode.com/problems/two-sum/",
        approaches=[
            {
                "name": "Brute force",
                "complexityTime": "O(n^2)",
                "complexitySpace": "O(1)",
                "approach": "Try all pairs.",
                "code": "for i in range(n): ...",
                "lang": "C++",
            },
            {"name": "Hash map", "code": "seen = {}"},
        ],
    )

    assert body["title"] == "Two Sum"
    assert body["topic"] == "Arrays"
    assert body["topicSlug"] == "arrays"
    assert body["difficulty"] == "Medium"
    assert body["status"] == "Not started"
    assert body["statement"] == "Find two numbers adding to target."
    assert body["exIn"] == "[2,7,11,15], 9"
    assert body["exOut"] == "[0,1]"
    assert body["notes"] == "classic"
    # The patterns relationship carries no explicit ordering, so compare as a set.
    assert sorted(body["patterns"]) == ["Hash Map", "Two Pointers"]
    assert body["leetcodeUrl"] == "https://leetcode.com/problems/two-sum/"
    # A fresh, non-done problem is immediately due for revision.
    assert body["due"] is True
    assert body["nextLabel"] == "today"
    assert body["dueMeta"] == "not started"
    assert body["revisions"] == 0
    assert body["lastRevised"] == "—"

    first, second = body["approaches"]
    assert (first["name"], first["lang"], first["position"]) == ("Brute force", "C++", 0)
    assert first["complexityTime"] == "O(n^2)"
    assert first["complexitySpace"] == "O(1)"
    assert (second["name"], second["lang"], second["position"]) == ("Hash map", "Python", 1)


def test_create_defaults_for_minimal_payload(client):
    body = post_problem(client)
    assert body["difficulty"] == "Easy"
    assert body["status"] == "Not started"
    assert body["patterns"] == []
    assert body["approaches"] == []
    assert body["checklistProgress"] is None
    assert body["exIn"] is None


def test_create_reuses_existing_topic(client, session, topic):
    body = post_problem(client, topic="Arrays")
    assert session.get(Problem, body["id"]).topic_id == topic.id
    assert len(session.exec(select(Topic)).all()) == 1


def test_create_makes_new_topic_with_slug(client, session):
    body = post_problem(client, topic="Dynamic Programming")
    assert body["topic"] == "Dynamic Programming"
    assert body["topicSlug"] == "dynamic-programming"
    created = session.exec(select(Topic).where(Topic.name == "Dynamic Programming")).one()
    assert created.slug == "dynamic-programming"


def test_create_done_sets_solved_at_and_schedules_out(client, session):
    body = post_problem(client, status="Done")
    assert body["dueMeta"] == "completed"
    assert body["due"] is False
    assert body["nextLabel"] == "in 6d"
    assert body["intervalDays"] == 6
    assert session.get(Problem, body["id"]).solved_at is not None


def test_create_shares_pattern_rows_and_skips_blank_names(client, session):
    post_problem(client, title="A", patterns=["Sliding Window"])
    body = post_problem(client, title="B", patterns=["Sliding Window", "   "])

    assert body["patterns"] == ["Sliding Window"]
    rows = session.exec(select(Pattern)).all()
    assert [p.name for p in rows] == ["Sliding Window"]


def test_legacy_approach_fields_surface_as_default_approach(client):
    body = post_problem(client, approach="Use a hash map.", solution="def solve(): ...")
    [entry] = body["approaches"]
    assert entry["id"] == "default"
    assert entry["name"] == "Default Approach"
    assert entry["approach"] == "Use a hash map."
    assert entry["code"] == "def solve(): ..."


# --- list ---


def test_list_starts_empty(client):
    assert client.get("/api/problems").json() == []


def test_list_filters_by_topic_difficulty_and_status(client):
    a = post_problem(client, title="A", topic="Arrays", difficulty="Easy")
    b = post_problem(client, title="B", topic="Graphs", difficulty="Hard", status="Solving")

    all_rows = client.get("/api/problems").json()
    assert [r["id"] for r in all_rows] == [b["id"], a["id"]]  # newest first

    by_slug = client.get("/api/problems", params={"topic": "graphs"}).json()
    assert [r["id"] for r in by_slug] == [b["id"]]

    by_name = client.get("/api/problems", params={"topic": "Arrays"}).json()
    assert [r["id"] for r in by_name] == [a["id"]]

    by_difficulty = client.get("/api/problems", params={"difficulty": "Hard"}).json()
    assert [r["id"] for r in by_difficulty] == [b["id"]]

    by_status = client.get("/api/problems", params={"status": "Solving"}).json()
    assert [r["id"] for r in by_status] == [b["id"]]

    assert client.get("/api/problems", params={"status": "Done"}).json() == []


def test_list_due_filter_hides_future_scheduled(client):
    due_now = post_problem(client, title="Fresh")
    post_problem(client, title="Completed", status="Done")  # due in 6 days

    rows = client.get("/api/problems", params={"due": "true"}).json()
    assert [r["id"] for r in rows] == [due_now["id"]]


# --- get ---


def test_get_problem_by_id(client):
    created = post_problem(client, notes="hello")
    res = client.get(f"/api/problems/{created['id']}")
    assert res.status_code == 200
    assert res.json()["id"] == created["id"]
    assert res.json()["notes"] == "hello"


def test_get_unknown_problem_is_404(client):
    res = client.get("/api/problems/nope")
    assert res.status_code == 404
    assert res.json()["detail"] == "Problem not found"


def test_other_users_problems_are_invisible(client, session):
    other = other_user(session)
    theirs = post_problem(client, headers={"X-User-Id": other.id}, title="Theirs")
    mine = post_problem(client, title="Mine")

    listed = client.get("/api/problems").json()
    assert [r["id"] for r in listed] == [mine["id"]]

    # Every per-item endpoint 404s on another user's problem (not 403 — the API
    # never confirms the id exists).
    assert client.get(f"/api/problems/{theirs['id']}").status_code == 404
    patch = client.patch(f"/api/problems/{theirs['id']}", json={"title": "hacked"})
    assert patch.status_code == 404
    assert client.delete(f"/api/problems/{theirs['id']}").status_code == 404
    review = client.post(f"/api/problems/{theirs['id']}/review", json={"grade": "Good"})
    assert review.status_code == 404

    # The owner's problem is untouched by all of the above: not renamed, not
    # deleted, and the rejected review left no grading behind.
    still = client.get(f"/api/problems/{theirs['id']}", headers={"X-User-Id": other.id})
    assert still.status_code == 200
    assert still.json()["title"] == "Theirs"
    assert still.json()["revisions"] == 0


# --- patch ---


def test_patch_updates_scalar_fields(client):
    created = post_problem(client)
    res = client.patch(
        f"/api/problems/{created['id']}",
        json={"title": "Two Sum II", "difficulty": "Hard", "exIn": "[1,2]", "notes": "revisit"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["title"] == "Two Sum II"
    assert body["difficulty"] == "Hard"
    assert body["exIn"] == "[1,2]"
    assert body["notes"] == "revisit"


def test_patch_to_done_sets_solved_at_and_leaving_keeps_it(client, session):
    pid = post_problem(client)["id"]
    assert session.get(Problem, pid).solved_at is None

    client.patch(f"/api/problems/{pid}", json={"status": "Done"})
    solved_at = session.get(Problem, pid).solved_at
    assert solved_at is not None

    # Leaving "Done" keeps the original solve moment...
    client.patch(f"/api/problems/{pid}", json={"status": "Solving"})
    assert session.get(Problem, pid).status == "Solving"
    assert session.get(Problem, pid).solved_at == solved_at

    # ...and returning to "Done" later does not move it.
    client.patch(f"/api/problems/{pid}", json={"status": "Done"})
    assert session.get(Problem, pid).solved_at == solved_at


def test_patch_checklist_progress_round_trips(client, session):
    pid = post_problem(client)["id"]

    body = client.patch(
        f"/api/problems/{pid}", json={"checklistProgress": [True, False, True]}
    ).json()
    assert body["checklistProgress"] == [True, False, True]

    assert client.get(f"/api/problems/{pid}").json()["checklistProgress"] == [True, False, True]
    assert json.loads(session.get(Problem, pid).checklist_progress) == [True, False, True]


def test_patch_replaces_approaches(client, session):
    pid = post_problem(client, approaches=[{"name": "First"}, {"name": "Second"}])["id"]

    body = client.patch(
        f"/api/problems/{pid}",
        json={"approaches": [{"name": "Optimal", "lang": "Go", "complexityTime": "O(n)"}]},
    ).json()

    assert [(a["name"], a["lang"], a["position"]) for a in body["approaches"]] == [
        ("Optimal", "Go", 0)
    ]
    rows = session.exec(select(ProblemApproach).where(ProblemApproach.problem_id == pid)).all()
    assert [r.name for r in rows] == ["Optimal"]
    assert rows[0].complexity_time == "O(n)"


def test_patch_empty_approaches_clears_them(client, session):
    pid = post_problem(client, approaches=[{"name": "First"}])["id"]

    body = client.patch(f"/api/problems/{pid}", json={"approaches": []}).json()

    assert body["approaches"] == []
    assert session.exec(select(ProblemApproach).where(ProblemApproach.problem_id == pid)).all() == []


def test_patch_replaces_topic_and_patterns(client):
    pid = post_problem(client, patterns=["Two Pointers"])["id"]

    body = client.patch(f"/api/problems/{pid}", json={"topic": "Graphs", "patterns": ["BFS"]}).json()

    assert body["topic"] == "Graphs"
    assert body["topicSlug"] == "graphs"
    assert body["patterns"] == ["BFS"]


def test_leetcode_url_links_catalog_question_on_create_and_patch(client, session):
    """A URL matching the catalog links the question (surfacing its hints);
    patching to an unknown URL re-resolves and unlinks."""
    session.add(
        LeetCodeQuestion(
            id="1",
            question_id="1",
            title="Two Sum",
            difficulty="Easy",
            leetcode_url="https://leetcode.com/problems/two-sum/",
            hints='["Try a hash map."]',
        )
    )
    session.commit()

    body = post_problem(client, leetcodeUrl="https://leetcode.com/problems/two-sum/")
    assert body["leetcodeId"] == "1"
    assert body["hints"] == ["Try a hash map."]

    patched = client.patch(
        f"/api/problems/{body['id']}",
        json={"leetcodeUrl": "https://leetcode.com/problems/other/"},
    ).json()
    assert patched["leetcodeUrl"] == "https://leetcode.com/problems/other/"
    assert patched["leetcodeId"] is None
    assert session.get(Problem, body["id"]).leetcode_id is None


# --- delete ---


def test_delete_cascades_to_revision_logs_and_approaches(client, session):
    pid = post_problem(client, approaches=[{"name": "First"}])["id"]
    client.post(f"/api/problems/{pid}/review", json={"grade": "Good"})

    res = client.delete(f"/api/problems/{pid}")
    assert res.status_code == 204

    assert client.get(f"/api/problems/{pid}").status_code == 404
    assert session.get(Problem, pid) is None
    assert session.exec(select(Revision).where(Revision.problem_id == pid)).all() == []
    assert session.exec(select(ReviewLog).where(ReviewLog.problem_id == pid)).all() == []
    assert session.exec(select(ProblemApproach).where(ProblemApproach.problem_id == pid)).all() == []


# --- review grading ---


def test_review_good_schedules_forward_and_logs(client, session):
    pid = post_problem(client)["id"]

    res = client.post(f"/api/problems/{pid}/review", json={"grade": "Good"})
    assert res.status_code == 200
    body = res.json()

    assert body["revisions"] == 1
    assert body["reviewCount"] == 1
    assert body["due"] is False
    assert body["intervalDays"] >= 1
    assert body["srsStability"] is not None
    assert body["lastReviewedAt"] is not None
    assert body["dueAt"] > body["lastReviewedAt"]  # same-format ISO strings

    # Grading reuses the revision row made at creation — still exactly one.
    revs = session.exec(select(Revision).where(Revision.problem_id == pid)).all()
    assert len(revs) == 1
    assert revs[0].review_count == 1
    assert revs[0].due_at is not None

    logs = client.get(f"/api/problems/{pid}/reviews").json()
    assert [(log["grade"], log["intervalDays"]) for log in logs] == [("Good", body["intervalDays"])]


def test_review_again_keeps_problem_due(client):
    pid = post_problem(client)["id"]
    client.post(f"/api/problems/{pid}/review", json={"grade": "Good"})

    body = client.post(f"/api/problems/{pid}/review", json={"grade": "Again"}).json()

    assert body["revisions"] == 2
    assert body["intervalDays"] == 0
    assert body["due"] is True
    assert body["nextLabel"] == "today"

    # History lists oldest first.
    logs = client.get(f"/api/problems/{pid}/reviews").json()
    assert [log["grade"] for log in logs] == ["Good", "Again"]


def test_review_invalid_grade_is_rejected(client):
    pid = post_problem(client)["id"]

    res = client.post(f"/api/problems/{pid}/review", json={"grade": "Perfect"})

    assert res.status_code == 422
    assert res.json()["detail"] == "Invalid grade"
    assert client.get(f"/api/problems/{pid}/reviews").json() == []
