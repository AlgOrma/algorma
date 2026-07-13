"""Thin client for the two LeetCode endpoints the sync feature uses.

Two access paths, chosen by what the user provides:

- ``fetch_solved_full(session_cookie)`` — the authenticated REST endpoint
  ``/api/problems/all/`` returns every question with the caller's per-question
  status (``"ac"`` = accepted) in a single response, so the complete solve
  history syncs in one call. Requires the browser's ``LEETCODE_SESSION``
  cookie, which is used for this one request and never stored.
- ``fetch_recent_accepted(username)`` — the public GraphQL
  ``recentAcSubmissionList`` query needs no credentials but only exposes the
  most recent accepted submissions (LeetCode caps the list at ~20 entries),
  so it suits incremental top-ups rather than a first full import.

Both return "solved entries": dicts with ``frontend_id`` (question number as a
string, or None), ``slug`` (URL slug, or None), and ``solved_at`` (unix seconds
of the accepted submission, or None when LeetCode doesn't report it).
"""

import json
import ssl
import urllib.error
import urllib.request
from typing import Any, Optional

import certifi

BASE_URL = "https://leetcode.com"
GRAPHQL_URL = f"{BASE_URL}/graphql/"
ALL_PROBLEMS_URL = f"{BASE_URL}/api/problems/all/"
TIMEOUT_SECONDS = 30

# LeetCode rejects requests without a browser-ish User-Agent.
_BASE_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": f"{BASE_URL}/",
    "Accept": "application/json",
}

_RECENT_AC_QUERY = """
query recentAcSubmissions($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) {
    titleSlug
    timestamp
  }
}
"""


class LeetCodeError(Exception):
    """LeetCode was unreachable or answered with something unusable."""


class LeetCodeAuthError(LeetCodeError):
    """The provided LEETCODE_SESSION cookie was missing, invalid, or expired."""


def _request_json(url: str, *, data: Optional[bytes] = None, headers: Optional[dict] = None) -> Any:
    req = urllib.request.Request(url, data=data, headers={**_BASE_HEADERS, **(headers or {})})
    # Explicit certifi CA bundle, same reasoning as seed_leetcode.py.
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS, context=ssl_context) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise LeetCodeAuthError(
                "LeetCode rejected the request — the session cookie is invalid or expired"
            ) from e
        raise LeetCodeError(f"LeetCode returned HTTP {e.code}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise LeetCodeError(f"Could not reach LeetCode: {e}") from e

    try:
        return json.loads(body)
    except json.JSONDecodeError as e:
        raise LeetCodeError("LeetCode returned an unexpected non-JSON response") from e


def fetch_solved_full(session_cookie: str) -> tuple[str, list[dict]]:
    """All accepted questions for the cookie's account: (username, solved entries)."""
    data = _request_json(
        ALL_PROBLEMS_URL,
        headers={"Cookie": f"LEETCODE_SESSION={session_cookie}"},
    )

    # An expired/invalid cookie doesn't 401 here — LeetCode just answers as an
    # anonymous visitor, with no user_name and every status null.
    username = data.get("user_name") or ""
    if not username:
        raise LeetCodeAuthError(
            "LeetCode did not recognize the session cookie — it may be expired. "
            "Log in to leetcode.com and copy a fresh LEETCODE_SESSION value."
        )

    solved = []
    for pair in data.get("stat_status_pairs") or []:
        if pair.get("status") != "ac":
            continue
        stat = pair.get("stat") or {}
        frontend_id = stat.get("frontend_question_id")
        slug = stat.get("question__title_slug")
        if frontend_id is None and not slug:
            continue
        solved.append(
            {
                "frontend_id": str(frontend_id) if frontend_id is not None else None,
                "slug": slug,
                "solved_at": None,  # this endpoint doesn't report solve times
            }
        )
    return username, solved


def fetch_recent_accepted(username: str, limit: int = 100) -> list[dict]:
    """The user's recent accepted submissions (public; LeetCode caps at ~20)."""
    payload = json.dumps(
        {"query": _RECENT_AC_QUERY, "variables": {"username": username, "limit": limit}}
    ).encode("utf-8")
    data = _request_json(
        GRAPHQL_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    errors = data.get("errors") or []
    if errors:
        message = errors[0].get("message") or "LeetCode rejected the query"
        if "exist" in message.lower():
            raise LeetCodeError(f'LeetCode user "{username}" was not found')
        raise LeetCodeError(message)

    submissions = (data.get("data") or {}).get("recentAcSubmissionList")
    if submissions is None:
        raise LeetCodeError(f'LeetCode user "{username}" was not found')

    return [
        {
            "frontend_id": None,
            "slug": s.get("titleSlug"),
            "solved_at": s.get("timestamp"),
        }
        for s in submissions
        if s.get("titleSlug")
    ]
