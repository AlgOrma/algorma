from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user
from ..models import Topic, User

router = APIRouter(prefix="/api/topics", tags=["topics"])


@router.get("")
def list_topics(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Topics with solved/total mastery for the current user, for the dashboard bars."""
    topics = session.exec(select(Topic).order_by(Topic.name)).all()
    result = []
    for topic in topics:
        mine = [p for p in topic.problems if p.user_id == user.id]
        total = len(mine)
        solved = sum(1 for p in mine if p.status == "Done")
        result.append(
            {
                "name": topic.name,
                "slug": topic.slug,
                "pct": round(solved / total * 100) if total else 0,
                "frac": f"{solved}/{total}",
                "total": total,
                "solved": solved,
            }
        )
    return result
