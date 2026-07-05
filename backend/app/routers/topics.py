from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user
from ..models import Problem, Topic, User

router = APIRouter(prefix="/api/topics", tags=["topics"])


@router.get("")
def list_topics(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Topics with solved/total progress for the current user's dashboard bars.

    Only topics the user has problems in, biggest topic first. The bar (`pct`)
    is exactly the `frac` as a percentage, so the two always agree.
    """
    problems = session.exec(
        select(Problem).where(Problem.user_id == user.id)
    ).all()
    if not problems:
        return []

    by_topic: dict[str, list[Problem]] = defaultdict(list)
    for p in problems:
        by_topic[p.topic_id].append(p)

    topics = session.exec(
        select(Topic).where(Topic.id.in_(by_topic.keys()))  # type: ignore[attr-defined]
    ).all()

    result = []
    for topic in topics:
        mine = by_topic[topic.id]
        total = len(mine)
        solved = sum(1 for p in mine if p.status == "Done")
        result.append(
            {
                "name": topic.name,
                "slug": topic.slug,
                # Round half up to match the frontend's Math.round fallback
                # (Python's round() is banker's rounding, which disagrees at .5).
                "pct": int(solved / total * 100 + 0.5),
                "frac": f"{solved}/{total}",
                "total": total,
                "solved": solved,
            }
        )
    result.sort(key=lambda t: (-t["total"], t["name"]))
    return result
