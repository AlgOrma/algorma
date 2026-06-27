from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..models import Topic

router = APIRouter(prefix="/api/topics", tags=["topics"])


@router.get("")
def list_topics(session: Session = Depends(get_session)):
    """Topics with solved/total mastery, for the dashboard bars."""
    topics = session.exec(select(Topic).order_by(Topic.name)).all()
    result = []
    for topic in topics:
        total = len(topic.problems)
        solved = sum(1 for p in topic.problems if p.status == "Done")
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
