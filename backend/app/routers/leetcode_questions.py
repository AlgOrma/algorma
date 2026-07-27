from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from ..db import get_session
from ..deps import get_current_user
from ..models import User
from ..serialize import serialize_leetcode_question, serialize_problem
from ..services import leetcode_questions as leetcode_service
from ..services import problems as problem_service

router = APIRouter(prefix="/api/leetcode-questions", tags=["leetcode_questions"])


@router.get("")
def list_leetcode_questions(
    q: Optional[str] = None,
    difficulty: Optional[str] = None,
    tag: Optional[str] = None,
    curriculum: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    session: Session = Depends(get_session),
):
    questions, total = leetcode_service.search_questions(
        session,
        q=q,
        difficulty=difficulty,
        tag=tag,
        curriculum=curriculum,
        page=page,
        limit=limit,
    )
    return {
        "items": [serialize_leetcode_question(x) for x in questions],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


@router.get("/{id}")
def get_leetcode_question(id: str, session: Session = Depends(get_session)):
    return serialize_leetcode_question(leetcode_service.get_question(session, id))


@router.post("/{id}/import", status_code=201)
def import_leetcode_question(
    id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    question = leetcode_service.get_question(session, id)
    problem, revision, now = problem_service.import_question(session, user, question)
    return serialize_problem(problem, revision, now)
