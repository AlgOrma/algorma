"""App wiring: health endpoints and the X-User-Id resolution in deps.py."""

from app.models import User


def test_root_points_at_docs_and_health(client):
    body = client.get("/").json()
    assert body["name"] == "AlgOrma API"
    assert body["docs"] == "/docs"
    assert body["health"] == "/api/health"


def test_health_reports_ok(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_missing_user_header_is_400(client):
    res = client.get("/api/users/me", headers={"X-User-Id": ""})
    assert res.status_code == 400
    assert "X-User-Id" in res.json()["detail"]


def test_unknown_user_is_404(client):
    res = client.get("/api/users/me", headers={"X-User-Id": "nope"})
    assert res.status_code == 404
    assert res.json()["detail"] == "User not found"


def test_current_user_resolves_from_header(client, user):
    res = client.get("/api/users/me")
    assert res.status_code == 200
    assert res.json()["id"] == user.id


def test_header_of_other_user_scopes_to_them(client, session, user):
    other = User(name="Other")
    session.add(other)
    session.commit()

    res = client.get("/api/users/me", headers={"X-User-Id": other.id})
    assert res.status_code == 200
    assert res.json()["id"] == other.id
    assert res.json()["id"] != user.id
