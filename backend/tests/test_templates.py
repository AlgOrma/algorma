"""Template library API: nested pattern/variation CRUD plus drag-and-drop reorder."""

from sqlmodel import select

from app.models import TemplateVariation, User


def variation(name, desc="", lang="Python", code=""):
    return {"name": name, "desc": desc, "lang": lang, "code": code}


def make_pattern(client, name="Sliding Window", variations=None, as_user=None, **fields):
    """POST a pattern; pass ``as_user`` to create it for a different user."""
    payload = {"name": name, "variations": variations or [], **fields}
    headers = {"X-User-Id": as_user.id} if as_user else None
    resp = client.post("/api/templates", json=payload, headers=headers)
    assert resp.status_code == 201
    return resp.json()


def make_other_user(session):
    other = User(name="Other User")
    session.add(other)
    session.commit()
    session.refresh(other)
    return other


def listed_names(client, **kwargs):
    resp = client.get("/api/templates", **kwargs)
    assert resp.status_code == 200
    return [p["name"] for p in resp.json()]


def test_list_is_empty_before_any_pattern_exists(client):
    resp = client.get("/api/templates")
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_returns_nested_shape_with_frontend_field_names(client):
    created = make_pattern(
        client,
        name="Two Pointers",
        topic="Arrays",
        description="Walk from both ends",
        variations=[
            variation("Converging", desc="ends inward", code="l, r = 0, n - 1"),
            variation("Fast/slow", lang="Java", code="int slow = 0;"),
        ],
    )

    assert created["name"] == "Two Pointers"
    assert created["topic"] == "Arrays"
    assert created["description"] == "Walk from both ends"
    # Variations keep the posted order and use the FE's desc/lang keys.
    assert [v["name"] for v in created["variations"]] == ["Converging", "Fast/slow"]
    first, second = created["variations"]
    assert first["desc"] == "ends inward"
    assert first["lang"] == "Python"
    assert first["code"] == "l, r = 0, n - 1"
    assert second["lang"] == "Java"
    assert first["id"] and second["id"] and first["id"] != second["id"]
    # No internal fields leak into the payload (DB rows also carry user_id /
    # pattern_id / position / timestamps).
    assert set(created) == {"id", "name", "topic", "description", "variations"}
    assert set(first) == {"id", "name", "desc", "lang", "code"}


def test_create_persists_variation_positions(client, session):
    created = make_pattern(
        client, variations=[variation("A"), variation("B"), variation("C")]
    )

    rows = session.exec(
        select(TemplateVariation)
        .where(TemplateVariation.pattern_id == created["id"])
        .order_by(TemplateVariation.position)
    ).all()
    assert [(v.name, v.position) for v in rows] == [("A", 0), ("B", 1), ("C", 2)]


def test_new_patterns_prepend_to_the_top_of_the_list(client):
    make_pattern(client, name="First")
    make_pattern(client, name="Second")
    make_pattern(client, name="Third")

    assert listed_names(client) == ["Third", "Second", "First"]


def test_patch_partial_fields_leaves_variations_untouched(client):
    created = make_pattern(
        client, variations=[variation("Original", code="pass")]
    )
    original_ids = [v["id"] for v in created["variations"]]

    resp = client.patch(
        f"/api/templates/{created['id']}", json={"name": "Renamed"}
    )
    assert resp.status_code == 200
    updated = resp.json()

    assert updated["name"] == "Renamed"
    assert updated["topic"] == created["topic"]
    assert updated["description"] == created["description"]
    # Omitting `variations` keeps the exact same rows (ids preserved).
    assert [v["id"] for v in updated["variations"]] == original_ids
    assert updated["variations"][0]["code"] == "pass"


def test_patch_updates_topic_and_description(client):
    created = make_pattern(client, name="Kadane", topic="", description="")

    resp = client.patch(
        f"/api/templates/{created['id']}",
        json={"topic": "Dynamic Programming", "description": "Max subarray sum"},
    )
    assert resp.status_code == 200
    assert resp.json()["topic"] == "Dynamic Programming"
    assert resp.json()["description"] == "Max subarray sum"
    assert resp.json()["name"] == "Kadane"  # untouched field survives

    # The update persists to a fresh GET.
    [pattern] = client.get("/api/templates").json()
    assert pattern["topic"] == "Dynamic Programming"
    assert pattern["description"] == "Max subarray sum"


def test_patch_with_variations_fully_replaces_the_set(client, session):
    created = make_pattern(
        client, variations=[variation("Old A"), variation("Old B")]
    )
    old_ids = {v["id"] for v in created["variations"]}

    resp = client.patch(
        f"/api/templates/{created['id']}",
        json={"variations": [variation("Fresh", code="new code")]},
    )
    assert resp.status_code == 200
    updated = resp.json()

    assert [v["name"] for v in updated["variations"]] == ["Fresh"]
    assert updated["variations"][0]["id"] not in old_ids

    # The old rows are gone from the database, not just hidden.
    rows = session.exec(
        select(TemplateVariation).where(
            TemplateVariation.pattern_id == created["id"]
        )
    ).all()
    assert [v.name for v in rows] == ["Fresh"]
    assert rows[0].position == 0


def test_patch_with_empty_variations_clears_them(client, session):
    created = make_pattern(client, variations=[variation("Only one")])

    resp = client.patch(
        f"/api/templates/{created['id']}", json={"variations": []}
    )
    assert resp.status_code == 200
    assert resp.json()["variations"] == []
    assert session.exec(select(TemplateVariation)).all() == []


def test_delete_pattern_cascades_its_variations(client, session):
    doomed = make_pattern(client, variations=[variation("A"), variation("B")])
    survivor = make_pattern(client, name="Survivor", variations=[variation("Kept")])

    resp = client.delete(f"/api/templates/{doomed['id']}")
    assert resp.status_code == 204

    assert listed_names(client) == ["Survivor"]
    remaining = session.exec(select(TemplateVariation)).all()
    assert [v.name for v in remaining] == ["Kept"]
    assert remaining[0].pattern_id == survivor["id"]


def test_reorder_patterns_persists_new_positions(client):
    a = make_pattern(client, name="A")
    b = make_pattern(client, name="B")
    c = make_pattern(client, name="C")
    assert listed_names(client) == ["C", "B", "A"]  # newest-first baseline

    resp = client.post(
        "/api/templates/reorder", json={"ids": [a["id"], c["id"], b["id"]]}
    )
    assert resp.status_code == 200
    assert [p["name"] for p in resp.json()] == ["A", "C", "B"]

    # The ordering survives a fresh GET.
    assert listed_names(client) == ["A", "C", "B"]


def test_reorder_patterns_ignores_unknown_and_foreign_ids(client, session):
    other = make_other_user(session)
    foreign = make_pattern(client, name="Foreign", as_user=other)
    a = make_pattern(client, name="A")
    make_pattern(client, name="B")
    assert listed_names(client) == ["B", "A"]

    resp = client.post(
        "/api/templates/reorder",
        json={"ids": [foreign["id"], "not-a-real-id", a["id"]]},
    )
    assert resp.status_code == 200
    # Foreign/unknown ids are dropped; the listed pattern moves first and the
    # omitted one keeps its place after it. The foreign pattern never appears.
    assert [p["name"] for p in resp.json()] == ["A", "B"]
    assert listed_names(client) == ["A", "B"]

    # The other user's own library is untouched.
    assert listed_names(client, headers={"X-User-Id": other.id}) == ["Foreign"]


def test_reorder_patterns_with_stale_partial_list_keeps_omitted_after_listed(client):
    make_pattern(client, name="A")
    b = make_pattern(client, name="B")
    make_pattern(client, name="C")
    assert listed_names(client) == ["C", "B", "A"]

    resp = client.post("/api/templates/reorder", json={"ids": [b["id"]]})
    assert resp.status_code == 200
    # B first, then the omitted patterns in their previous relative order.
    assert listed_names(client) == ["B", "C", "A"]


def test_reorder_variations_persists_new_positions(client):
    created = make_pattern(
        client, variations=[variation("A"), variation("B"), variation("C")]
    )
    ids = {v["name"]: v["id"] for v in created["variations"]}

    resp = client.post(
        f"/api/templates/{created['id']}/variations/reorder",
        json={"ids": [ids["C"], ids["A"], ids["B"]]},
    )
    assert resp.status_code == 200
    reordered = resp.json()["variations"]
    assert [v["name"] for v in reordered] == ["C", "A", "B"]
    # Reordering keeps the same rows (ids preserved).
    assert {v["id"] for v in reordered} == set(ids.values())

    resp = client.get("/api/templates")
    [pattern] = resp.json()
    assert [v["name"] for v in pattern["variations"]] == ["C", "A", "B"]


def test_reorder_variations_ignores_unknown_ids_and_keeps_omitted_order(client):
    created = make_pattern(
        client, variations=[variation("A"), variation("B"), variation("C")]
    )
    ids = {v["name"]: v["id"] for v in created["variations"]}

    resp = client.post(
        f"/api/templates/{created['id']}/variations/reorder",
        json={"ids": [ids["B"], "not-a-real-id"]},
    )
    assert resp.status_code == 200
    # B moves first; omitted A and C keep their relative order after it.
    assert [v["name"] for v in resp.json()["variations"]] == ["B", "A", "C"]


def test_pattern_endpoints_404_for_another_users_pattern(client, session):
    other = make_other_user(session)
    foreign = make_pattern(
        client, name="Foreign", variations=[variation("Theirs")], as_user=other
    )

    patch = client.patch(f"/api/templates/{foreign['id']}", json={"name": "Stolen"})
    delete = client.delete(f"/api/templates/{foreign['id']}")
    reorder = client.post(
        f"/api/templates/{foreign['id']}/variations/reorder", json={"ids": []}
    )
    assert patch.status_code == 404
    assert delete.status_code == 404
    assert reorder.status_code == 404

    # Nothing about the foreign pattern changed.
    resp = client.get("/api/templates", headers={"X-User-Id": other.id})
    [pattern] = resp.json()
    assert pattern["name"] == "Foreign"
    assert [v["name"] for v in pattern["variations"]] == ["Theirs"]


def test_unknown_pattern_id_is_404(client):
    assert client.patch("/api/templates/nope", json={"name": "X"}).status_code == 404
    assert client.delete("/api/templates/nope").status_code == 404
    assert (
        client.post("/api/templates/nope/variations/reorder", json={"ids": []})
    ).status_code == 404


def test_pattern_lists_are_isolated_per_user(client, session):
    other = make_other_user(session)
    make_pattern(client, name="Mine")
    make_pattern(client, name="Theirs", as_user=other)

    assert listed_names(client) == ["Mine"]
    assert listed_names(client, headers={"X-User-Id": other.id}) == ["Theirs"]
