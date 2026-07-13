"""Sync a user's solved LeetCode problems into their personal problem bank.

``POST /api/leetcode/sync`` fetches the accepted-question list from LeetCode
(full history with a LEETCODE_SESSION cookie, or recent submissions by
username), matches it against the local LeetCode question catalog, and then:

- imports each solved question that isn't in the user's bank yet as a
  ``Done`` problem (with a Revision, like the one-click import), and
- marks any matching problem already in the bank as ``Done``.

The session cookie is used for the single fetch and never persisted. The
resolved username is remembered on the profile for prefilling future syncs.
"""

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, col, select

from .. import leetcode_client
from ..db import get_session
from ..deps import get_current_user
from ..leetcode_client import LeetCodeAuthError, LeetCodeError
from ..models import LeetCodeQuestion, Problem, Revision, User
from ..schemas import LeetCodeSyncRequest
from ..utils import utcnow
from .leetcode_questions import map_leetcode_tags_to_topic
from .problems import get_or_create_topic

router = APIRouter(prefix="/api/leetcode", tags=["leetcode_sync"])

_SLUG_RE = re.compile(r"/problems/([^/?#]+)")


def _slug_from_url(url: str) -> Optional[str]:
    match = _SLUG_RE.search(url or "")
    return match.group(1).strip("/").lower() if match else None


def _solved_at_from_entry(entry: dict, now: datetime) -> datetime:
    """Submission time when LeetCode reports one, else the sync time (naive UTC)."""
    ts = entry.get("solved_at")
    if ts:
        try:
            return datetime.fromtimestamp(int(ts), tz=timezone.utc).replace(tzinfo=None)
        except (ValueError, OverflowError, OSError):
            pass
    return now


@router.post("/sync")
def sync_solved_problems(
    payload: LeetCodeSyncRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    username = (payload.username or "").strip()
    cookie = (payload.session_cookie or "").strip()
    # Tolerate pasting the whole "name=value" pair from DevTools.
    if cookie.startswith("LEETCODE_SESSION="):
        cookie = cookie[len("LEETCODE_SESSION="):]

    if not username and not cookie:
        raise HTTPException(
            status_code=400,
            detail="Provide a LeetCode username or a LEETCODE_SESSION cookie",
        )

    try:
        if cookie:
            mode = "full"
            lc_username, solved = leetcode_client.fetch_solved_full(cookie)
        else:
            mode = "recent"
            lc_username = username
            solved = leetcode_client.fetch_recent_accepted(username)
    except LeetCodeAuthError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
    except LeetCodeError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    # Resolve solved entries against the catalog via lightweight lookup maps
    # (id + url only), deferring the heavy rows to one IN query below.
    catalog_refs = session.exec(
        select(LeetCodeQuestion.id, LeetCodeQuestion.leetcode_url)
    ).all()
    known_ids = {qid for qid, _ in catalog_refs}
    slug_to_id = {}
    for qid, url in catalog_refs:
        slug = _slug_from_url(url)
        if slug:
            slug_to_id[slug] = qid

    matched: dict[str, dict] = {}  # catalog question id -> solved entry
    unmatched: list[str] = []
    for entry in solved:
        qid = entry.get("frontend_id")
        if qid not in known_ids:
            qid = slug_to_id.get((entry.get("slug") or "").lower())
        if qid is None:
            unmatched.append(entry.get("slug") or entry.get("frontend_id") or "?")
        elif qid not in matched:
            matched[qid] = entry

    questions = (
        session.exec(
            select(LeetCodeQuestion).where(col(LeetCodeQuestion.id).in_(list(matched)))
        ).all()
        if matched
        else []
    )

    problems = session.exec(select(Problem).where(Problem.user_id == user.id)).all()
    by_leetcode_id = {p.leetcode_id: p for p in problems if p.leetcode_id}
    by_url = {p.leetcode_url: p for p in problems if p.leetcode_url}

    now = utcnow()
    imported = marked_done = already_done = 0
    for q in questions:
        solved_at = _solved_at_from_entry(matched[q.id], now)
        existing = by_leetcode_id.get(q.id) or by_url.get(q.leetcode_url)

        if existing:
            if existing.status == "Done":
                already_done += 1
                continue
            existing.status = "Done"
            if existing.solved_at is None:
                existing.solved_at = solved_at
            existing.updated_at = now
            session.add(existing)
            marked_done += 1
            continue

        tags = json.loads(q.topic_tags) if q.topic_tags else []
        topic = get_or_create_topic(session, map_leetcode_tags_to_topic(tags))
        problem = Problem(
            user_id=user.id,
            title=f"{q.id}. {q.title}",
            topic_id=topic.id,
            difficulty=q.difficulty,
            status="Done",
            solved_at=solved_at,
            statement=q.statement,
            leetcode_url=q.leetcode_url,
            leetcode_id=q.id,
            created_at=now,
            updated_at=now,
        )
        session.add(problem)
        session.flush()  # assign problem.id for the revision row
        # Same convention as POST /problems: completed work gets a short interval.
        session.add(
            Revision(
                user_id=user.id,
                problem_id=problem.id,
                due_at=now + timedelta(days=6),
                interval_days=6,
                created_at=now,
                updated_at=now,
            )
        )
        imported += 1

    if lc_username and user.leetcode_username != lc_username:
        user.leetcode_username = lc_username
        user.updated_at = now
        session.add(user)

    session.commit()

    return {
        "mode": mode,
        "username": lc_username,
        "totalSolved": len(solved),
        "matched": len(matched),
        "imported": imported,
        "markedDone": marked_done,
        "alreadyDone": already_done,
        "unmatched": unmatched,
    }
