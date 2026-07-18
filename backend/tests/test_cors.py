"""CORS allow-list tests.

Since login moved to a cookie, CORS is an authentication boundary rather than
a convenience setting: ``allow_credentials=True`` means any origin on this list
can call the API *as the logged-in user*. The wildcard-localhost regex that
used to sit here handed that to every process on the machine, so these tests
pin that the list stays explicit.

``_allowed_origins()`` re-reads settings on each call and is tested directly;
the middleware itself binds its result once at import, so the end-to-end
preflight below derives its origin from the configuration actually in force
rather than assuming a value (a developer's .env may set WEB_ORIGIN).
"""

import pytest
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.main import _allowed_origins, app


@pytest.fixture
def web_origin(monkeypatch):
    def configure(value):
        monkeypatch.setattr(settings, "web_origin", value)
        return _allowed_origins()

    return configure


def cors_middleware_kwargs():
    entry = next(m for m in app.user_middleware if m.cls is CORSMiddleware)
    return entry.kwargs


# --- parsing -------------------------------------------------------------------


def test_parses_a_comma_separated_list(web_origin):
    assert web_origin("https://algorma.app, https://staging.algorma.app") == [
        "https://algorma.app",
        "https://staging.algorma.app",
    ]


def test_strips_trailing_slashes_and_collapses_duplicates(web_origin):
    # A browser's Origin header never has a trailing slash, so an operator who
    # pastes one from the address bar would otherwise silently get nothing.
    assert web_origin("https://algorma.app/, https://algorma.app") == [
        "https://algorma.app"
    ]


def test_accepts_an_ipv6_literal(web_origin):
    # The host[:port] round-trip check rebuilds netloc from .hostname, which
    # strips the brackets off an IPv6 literal — so this is the entry a naive
    # check would reject. It is a legitimate browser origin.
    assert web_origin("http://[::1]:5199") == ["http://[::1]:5199"]


def test_empty_value_allows_no_cross_origin_access(web_origin):
    # Valid config, not a misconfiguration: one process serving API and UI
    # together needs no cross-origin access at all.
    assert web_origin("") == []
    assert web_origin("  ,  ") == []


# --- loopback handling ----------------------------------------------------------


def test_loopback_origin_implies_its_counterpart_hostname(web_origin):
    # Same dev server to a human, two origins to a browser.
    assert web_origin("http://localhost:5199") == [
        "http://localhost:5199",
        "http://127.0.0.1:5199",
    ]
    assert web_origin("http://127.0.0.1:4173") == [
        "http://127.0.0.1:4173",
        "http://localhost:4173",
    ]


def test_loopback_mirroring_does_not_widen_the_port_set(web_origin):
    """The regression this replaced: every http://localhost:<port> was trusted,
    so any other local process could ride the session cookie."""
    allowed = web_origin("http://localhost:5199")
    assert "http://localhost:31337" not in allowed
    assert "http://127.0.0.1:31337" not in allowed
    assert len(allowed) == 2


def test_non_loopback_origins_are_not_mirrored(web_origin):
    assert web_origin("https://algorma.app") == ["https://algorma.app"]


# --- malformed configuration ------------------------------------------------------
#
# The allow-list is built at import time, so a bad entry stops the process. What
# it must not do is stop it with a bare urllib traceback that never says which
# setting was wrong — an operator reading `port out of range 0-65535` from
# urllib/parse.py has no way to know WEB_ORIGIN caused it.


@pytest.mark.parametrize(
    "entry, reason",
    [
        ("http://localhost:80800", "port out of range"),
        ("http://localhost:abc", "port could not be cast"),
        ("ftp://example.com", "expected an http:// or https:// scheme"),
        ("notaurl", "expected an http:// or https:// scheme"),
        ("https://algorma.app/app", "expected scheme://host[:port] and nothing else"),
        # Userinfo and a bare trailing colon parse cleanly but can never match a
        # browser Origin header, so accepting them would leave an allow-list that
        # looks configured and silently denies every request.
        ("http://user@localhost:5199", "expected scheme://host[:port] and nothing else"),
        ("https://algorma.app:", "expected scheme://host[:port] and nothing else"),
    ],
)
def test_a_malformed_entry_fails_with_a_message_naming_the_setting(
    web_origin, entry, reason
):
    with pytest.raises(ValueError) as exc:
        web_origin(entry)

    message = str(exc.value)
    assert "WEB_ORIGIN" in message  # the whole point: name the setting
    assert repr(entry) in message  # …and the offending entry
    # The port reasons are urllib's own wording, so match loosely; a CPython
    # rewording shouldn't fail a test about *our* framing.
    assert reason in message


def test_a_bad_port_is_rejected_on_non_loopback_origins_too(web_origin):
    """The asymmetry this closed: only the loopback branch ever read `.port`,
    so a typo'd port on a public origin sailed through into the allow-list as a
    string that no browser Origin header can ever equal."""
    with pytest.raises(ValueError):
        web_origin("https://algorma.app:99999")


def test_one_bad_entry_fails_the_whole_list(web_origin):
    """Fail-fast, not skip-the-entry: silently dropping the bad one leaves an
    allow-list that looks configured and denies the frontend it was written
    for."""
    with pytest.raises(ValueError):
        web_origin("https://algorma.app, http://localhost:80800")


# --- the middleware as actually configured ----------------------------------------


def test_no_origin_regex_is_configured():
    """An `allow_origin_regex` is how the wildcard crept in the first time."""
    assert cors_middleware_kwargs().get("allow_origin_regex") is None


def test_preflight_allows_a_configured_origin_and_refuses_others(client):
    allowed = cors_middleware_kwargs()["allow_origins"]
    if not allowed:
        pytest.skip("WEB_ORIGIN is empty in this environment: nothing to allow")

    def preflight(origin):
        return client.options(
            "/api/users/me",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            },
        )

    ok = preflight(allowed[0])
    assert ok.status_code == 200
    assert ok.headers["access-control-allow-origin"] == allowed[0]
    assert ok.headers["access-control-allow-credentials"] == "true"

    denied = preflight("http://localhost:31337")
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers


def test_simple_request_from_a_foreign_origin_gets_no_credentials_header(client):
    """Without the ACAO header the browser blocks the response, so the cookie
    the request carried is useless to the calling page."""
    res = client.get("/api/health", headers={"Origin": "http://evil.example.com"})
    assert "access-control-allow-origin" not in res.headers
