from fastapi import APIRouter, Depends, Response
from sqlmodel import Session

from ..db import get_session
from ..deps import get_current_user
from ..models import User
from ..schemas import GradeIn, ProblemCreate, ProblemUpdate
from ..serialize import serialize_problem, serialize_review_log
from ..services import problems as problem_service
from ..utils import utcnow

router = APIRouter(prefix="/api/problems", tags=["problems"])


@router.get("")
def list_problems(
    topic: str | None = None,
    difficulty: str | None = None,
    status: str | None = None,
    due: bool | None = None,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    problems = problem_service.list_problems(
        session, user, topic=topic, difficulty=difficulty, status=status
    )
    now = utcnow()
    rows = [serialize_problem(p, p.revision, now) for p in problems]
    if due is True:
        rows = [r for r in rows if r["due"]]
    return rows


@router.get("/{problem_id}")
def get_problem(
    problem_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    problem = problem_service.get_owned_problem(session, user, problem_id)
    return serialize_problem(problem, problem.revision)


@router.post("", status_code=201)
def create_problem(
    payload: ProblemCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    problem, revision, now = problem_service.create_problem(session, user, payload)
    return serialize_problem(problem, revision, now)


@router.patch("/{problem_id}")
def update_problem(
    problem_id: str,
    payload: ProblemUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    problem = problem_service.update_problem(session, user, problem_id, payload)
    return serialize_problem(problem, problem.revision)


@router.get("/{problem_id}/reviews")
def list_problem_reviews(
    problem_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """The problem's grading history, oldest first — powers the revision-history
    panel in the revise session."""
    logs = problem_service.list_problem_reviews(session, user, problem_id)
    return [serialize_review_log(log) for log in logs]


@router.delete("/{problem_id}", status_code=204)
def delete_problem(
    problem_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    problem_service.delete_problem(session, user, problem_id)
    return Response(status_code=204)


@router.post("/{problem_id}/review")
def review_problem(
    problem_id: str,
    payload: GradeIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    problem, revision, now = problem_service.review_problem(
        session, user, problem_id, payload.grade
    )
    return serialize_problem(problem, revision, now)
