"""Curriculum endpoints: create/list/get/delete plus question links.

Ownership model under test: rows with user_id=None are global (seeded) lists —
readable by everyone, mutable by no one (403) — while private lists are only
visible to and mutable by their owner. The API only ever creates user-owned
lists, so tests seed global ones directly in the database (make_curriculum).
"""

from datetime import datetime

from sqlmodel import select

from app.models import Curriculum, CurriculumQuestionLink, LeetCodeQuestion, User


def make_user(session, name="Other User"):
    u = User(name=name)
    session.add(u)
    session.commit()
    session.refresh(u)
    return u


def make_curriculum(session, name, slug, user_id=None):
    """Seed a curriculum directly (the API can only create user-owned ones)."""
    c = Curriculum(name=name, slug=slug, user_id=user_id)
    session.add(c)
    session.commit()
    session.refresh(c)
    return c


def make_question(session, qid):
    q = LeetCodeQuestion(
        id=qid,
        question_id=qid,
        title=f"Question {qid}",
        difficulty="Easy",
        leetcode_url=f"https://leetcode.com/problems/q{qid}/",
    )
    session.add(q)
    session.commit()
    session.refresh(q)
    return q


def create_plan(client, name, **fields):
    """POST /api/curriculums and return the created body (asserts 201)."""
    resp = client.post("/api/curriculums", json={"name": name, **fields})
    assert resp.status_code == 201
    return resp.json()


def add_questions(client, curriculum_id, ids):
    return client.post(
        f"/api/curriculums/{curriculum_id}/questions", json={"questionIds": ids}
    )


def link_count(session, curriculum_id):
    return len(
        session.exec(
            select(CurriculumQuestionLink).where(
                CurriculumQuestionLink.curriculum_id == curriculum_id
            )
        ).all()
    )


# ---------------------------------------------------------------- create


def test_create_generates_slug_from_name(client, session, user):
    body = create_plan(client, "My Study Plan!", description="grind time")

    assert body["slug"] == "my-study-plan"
    assert body["name"] == "My Study Plan!"
    assert body["description"] == "grind time"
    assert body["userId"] == user.id
    assert body["isGlobal"] is False
    assert body["questionCount"] == 0
    assert body["createdAt"] is not None and body["updatedAt"] is not None
    assert session.get(Curriculum, body["id"]) is not None


def test_create_duplicate_name_gets_suffixed_slug(client):
    first = create_plan(client, "Blind 75")
    second = create_plan(client, "Blind 75")
    third = create_plan(client, "Blind 75")

    assert first["slug"] == "blind-75"
    assert second["slug"] == "blind-75-1"
    assert third["slug"] == "blind-75-2"
    # All three persisted as distinct rows.
    assert len({first["id"], second["id"], third["id"]}) == 3


def test_create_slug_avoids_existing_global_slug(client, session):
    make_curriculum(session, "Seeded Blind 75", "blind-75", user_id=None)

    body = create_plan(client, "Blind 75")

    assert body["slug"] == "blind-75-1"


def test_create_ignores_is_global_flag(client, user):
    # The schema accepts isGlobal but the service always creates a user-owned
    # curriculum: global lists come only from the seed script.
    body = create_plan(client, "Sneaky Global", isGlobal=True)

    assert body["isGlobal"] is False
    assert body["userId"] == user.id


def test_create_without_name_is_422(client):
    resp = client.post("/api/curriculums", json={"description": "no name"})
    assert resp.status_code == 422


# ------------------------------------------------------------------ list


def test_list_empty(client):
    resp = client.get("/api/curriculums")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_shows_global_and_own_but_not_foreign(client, session, user):
    other = make_user(session)
    make_curriculum(session, "Seeded Global", "seeded-global", user_id=None)
    make_curriculum(session, "Mine", "mine", user_id=user.id)
    make_curriculum(session, "Theirs", "theirs", user_id=other.id)

    resp = client.get("/api/curriculums")

    assert resp.status_code == 200
    by_slug = {c["slug"]: c for c in resp.json()}
    assert set(by_slug) == {"seeded-global", "mine"}
    assert by_slug["seeded-global"]["isGlobal"] is True
    assert by_slug["seeded-global"]["userId"] is None
    assert by_slug["mine"]["isGlobal"] is False
    assert by_slug["mine"]["userId"] == user.id


def test_list_includes_question_counts(client, session):
    make_question(session, "1")
    make_question(session, "2")
    counted = create_plan(client, "Counted")
    create_plan(client, "Empty")
    add_questions(client, counted["id"], ["1", "2"])

    counts = {
        c["slug"]: c["questionCount"] for c in client.get("/api/curriculums").json()
    }

    assert counts == {"counted": 2, "empty": 0}


# ------------------------------------------------------------------- get


def test_get_by_id_and_by_slug_return_same_detail(client, session):
    make_question(session, "1")
    created = create_plan(client, "Detail Plan")
    add_questions(client, created["id"], ["1"])

    by_id = client.get(f"/api/curriculums/{created['id']}")
    by_slug = client.get("/api/curriculums/detail-plan")

    assert by_id.status_code == 200
    assert by_slug.status_code == 200
    assert by_id.json() == by_slug.json()
    detail = by_id.json()
    assert detail["id"] == created["id"]
    assert "questionCount" not in detail  # detail embeds the questions instead
    assert detail["questions"] == [
        {
            "id": "1",
            "questionId": "1",
            "title": "Question 1",
            "difficulty": "Easy",
            "leetcodeUrl": "https://leetcode.com/problems/q1/",
        }
    ]


def test_get_global_curriculum_readable_by_any_user(client, session):
    make_curriculum(session, "Seeded Global", "seeded-global", user_id=None)

    resp = client.get("/api/curriculums/seeded-global")

    assert resp.status_code == 200
    assert resp.json()["isGlobal"] is True
    assert resp.json()["questions"] == []


def test_get_foreign_private_curriculum_forbidden(client, session):
    other = make_user(session)
    theirs = make_curriculum(session, "Theirs", "theirs", user_id=other.id)

    assert client.get(f"/api/curriculums/{theirs.id}").status_code == 403
    assert client.get("/api/curriculums/theirs").status_code == 403


def test_get_missing_curriculum_404(client):
    assert client.get("/api/curriculums/no-such-plan").status_code == 404


def test_questions_listed_in_numeric_order(client, session):
    for qid in ("10", "2", "3"):
        make_question(session, qid)
    created = create_plan(client, "Ordered")
    add_questions(client, created["id"], ["10", "2", "3"])

    detail = client.get(f"/api/curriculums/{created['id']}").json()

    # Ordered by id length then id: natural question-number order.
    assert [q["id"] for q in detail["questions"]] == ["2", "3", "10"]


# --------------------------------------------------------- add questions


def test_add_questions_links_and_counts(client, session):
    make_question(session, "1")
    make_question(session, "2")
    created = create_plan(client, "Linkable")

    resp = add_questions(client, created["id"], ["1", "2"])

    assert resp.status_code == 201
    assert resp.json() == {"addedCount": 2}
    assert link_count(session, created["id"]) == 2


def test_add_questions_skips_duplicates_and_unknown_ids(client, session):
    make_question(session, "1")
    make_question(session, "2")
    created = create_plan(client, "Dedup")
    add_questions(client, created["id"], ["1"])

    # "1" already linked, "2" repeated in the payload, "999" not in the catalog.
    resp = add_questions(client, created["id"], ["1", "2", "2", "999"])

    assert resp.status_code == 201
    assert resp.json() == {"addedCount": 1}
    assert link_count(session, created["id"]) == 2


def test_add_questions_empty_payload_adds_nothing(client):
    created = create_plan(client, "Still Empty")

    resp = client.post(f"/api/curriculums/{created['id']}/questions", json={})

    assert resp.status_code == 201
    assert resp.json() == {"addedCount": 0}


def test_add_questions_to_global_or_foreign_forbidden(client, session):
    make_question(session, "1")
    other = make_user(session)
    seeded = make_curriculum(session, "Seeded", "seeded", user_id=None)
    theirs = make_curriculum(session, "Theirs", "theirs", user_id=other.id)

    for curriculum in (seeded, theirs):
        resp = client.post(
            f"/api/curriculums/{curriculum.id}/questions",
            json={"questionIds": ["1"]},
        )
        assert resp.status_code == 403
        assert link_count(session, curriculum.id) == 0


def test_add_questions_bumps_updated_at_only_when_links_change(client, session):
    make_question(session, "1")
    created = create_plan(client, "Timestamped")

    def updated_at():
        raw = client.get(f"/api/curriculums/{created['id']}").json()["updatedAt"]
        return datetime.fromisoformat(raw)

    before = updated_at()

    add_questions(client, created["id"], ["999"])  # unknown id: no-op
    assert updated_at() == before

    add_questions(client, created["id"], ["1"])
    assert updated_at() > before


def test_add_questions_missing_curriculum_404(client, session):
    make_question(session, "1")
    resp = client.post("/api/curriculums/nope/questions", json={"questionIds": ["1"]})
    assert resp.status_code == 404


# ------------------------------------------------------- remove question


def test_remove_question_unlinks(client, session):
    make_question(session, "1")
    make_question(session, "2")
    created = create_plan(client, "Shrinking")
    add_questions(client, created["id"], ["1", "2"])

    resp = client.delete(f"/api/curriculums/{created['id']}/questions/1")

    assert resp.status_code == 204
    detail = client.get(f"/api/curriculums/{created['id']}").json()
    assert [q["id"] for q in detail["questions"]] == ["2"]
    # The catalog row itself is untouched.
    assert session.get(LeetCodeQuestion, "1") is not None


def test_remove_question_not_linked_is_noop(client):
    created = create_plan(client, "Nothing To Remove")
    resp = client.delete(f"/api/curriculums/{created['id']}/questions/1")
    assert resp.status_code == 204


def test_remove_question_from_global_or_foreign_forbidden(client, session):
    make_question(session, "1")
    other = make_user(session)
    seeded = make_curriculum(session, "Seeded", "seeded", user_id=None)
    theirs = make_curriculum(session, "Theirs", "theirs", user_id=other.id)
    for curriculum in (seeded, theirs):
        session.add(
            CurriculumQuestionLink(curriculum_id=curriculum.id, leetcode_id="1")
        )
    session.commit()

    for curriculum in (seeded, theirs):
        resp = client.delete(f"/api/curriculums/{curriculum.id}/questions/1")
        assert resp.status_code == 403
        assert link_count(session, curriculum.id) == 1  # link untouched


# ---------------------------------------------------------------- delete


def test_delete_own_curriculum_removes_links(client, session):
    make_question(session, "1")
    created = create_plan(client, "Doomed")
    add_questions(client, created["id"], ["1"])

    resp = client.delete(f"/api/curriculums/{created['id']}")

    assert resp.status_code == 204
    assert session.get(Curriculum, created["id"]) is None
    assert link_count(session, created["id"]) == 0
    # Deleting the list never deletes the catalog rows it pointed at.
    assert session.get(LeetCodeQuestion, "1") is not None
    assert client.get(f"/api/curriculums/{created['id']}").status_code == 404


def test_delete_global_curriculum_forbidden(client, session):
    seeded = make_curriculum(session, "Seeded", "seeded", user_id=None)

    resp = client.delete(f"/api/curriculums/{seeded.id}")

    assert resp.status_code == 403
    assert session.get(Curriculum, seeded.id) is not None


def test_delete_foreign_curriculum_forbidden(client, session):
    other = make_user(session)
    theirs = make_curriculum(session, "Theirs", "theirs", user_id=other.id)

    resp = client.delete(f"/api/curriculums/{theirs.id}")

    assert resp.status_code == 403
    assert session.get(Curriculum, theirs.id) is not None


def test_delete_missing_curriculum_404(client):
    assert client.delete("/api/curriculums/nope").status_code == 404


def test_delete_by_slug_not_supported(client):
    # Mutations resolve by id only; the slug is treated as an unknown id.
    created = create_plan(client, "Slug Only")

    assert client.delete(f"/api/curriculums/{created['slug']}").status_code == 404
    assert client.get(f"/api/curriculums/{created['id']}").status_code == 200


# ------------------------------------------------------------------ auth


def test_requests_without_valid_user_rejected(client):
    assert (
        client.get("/api/curriculums", headers={"X-User-Id": ""}).status_code == 400
    )
    assert (
        client.get("/api/curriculums", headers={"X-User-Id": "ghost"}).status_code
        == 404
    )
