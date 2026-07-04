import json
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user
from ..models import Pattern, Problem, ReviewLog, Revision, Topic, User
from ..revisions import get_or_create_problem_revision, grade_revision
from ..schemas import GradeIn, ProblemCreate, ProblemUpdate
from ..serialize import serialize_problem
from ..srs import VALID_GRADES
from ..utils import slugify, utcnow

router = APIRouter(prefix="/api/problems", tags=["problems"])

# Frontend field -> model attribute, where they differ.
_FIELD_MAP = {"ex_in": "example_input", "ex_out": "example_output"}


def get_or_create_topic(session: Session, name: str) -> Topic:
    name = name.strip()
    topic = session.exec(select(Topic).where(Topic.name == name)).first()
    if topic:
        return topic
    topic = Topic(name=name, slug=slugify(name) or name.lower())
    session.add(topic)
    session.commit()
    session.refresh(topic)
    return topic


def resolve_patterns(session: Session, names: list[str]) -> list[Pattern]:
    patterns: list[Pattern] = []
    for raw in names or []:
        name = raw.strip()
        if not name:
            continue
        pattern = session.exec(select(Pattern).where(Pattern.name == name)).first()
        if not pattern:
            pattern = Pattern(name=name)
            session.add(pattern)
            session.commit()
            session.refresh(pattern)
        patterns.append(pattern)
    return patterns


def _get_owned_problem(session: Session, user: User, problem_id: str) -> Problem:
    problem = session.get(Problem, problem_id)
    if not problem or problem.user_id != user.id:
        raise HTTPException(status_code=404, detail="Problem not found")
    return problem


@router.get("")
def list_problems(
    topic: str | None = None,
    difficulty: str | None = None,
    status: str | None = None,
    due: bool | None = None,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    stmt = (
        select(Problem)
        .where(Problem.user_id == user.id)
        .options(
            selectinload(Problem.approaches),
            selectinload(Problem.leetcode_question),
            selectinload(Problem.topic),
            selectinload(Problem.patterns),
            selectinload(Problem.revision),
        )
        .order_by(Problem.created_at.desc())
    )
    if difficulty:
        stmt = stmt.where(Problem.difficulty == difficulty)
    if status:
        stmt = stmt.where(Problem.status == status)
    if topic:
        stmt = stmt.join(Topic).where((Topic.slug == topic) | (Topic.name == topic))

    now = utcnow()
    rows = [serialize_problem(p, p.revision, now) for p in session.exec(stmt).all()]
    if due is True:
        rows = [r for r in rows if r["due"]]
    return rows


@router.get("/{problem_id}")
def get_problem(
    problem_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    problem = _get_owned_problem(session, user, problem_id)
    return serialize_problem(problem, problem.revision)


@router.post("", status_code=201)
def create_problem(
    payload: ProblemCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    topic = get_or_create_topic(session, payload.topic)
    now = utcnow()

    # Resolve leetcode_id if leetcode_url is provided
    leetcode_id = None
    if payload.leetcode_url:
        from ..models import LeetCodeQuestion
        lc_q = session.exec(select(LeetCodeQuestion).where(LeetCodeQuestion.leetcode_url == payload.leetcode_url)).first()
        if lc_q:
            leetcode_id = lc_q.id

    # Build approaches list if provided
    from ..models import ProblemApproach
    approaches = []
    if payload.approaches:
        approaches = [
            ProblemApproach(
                name=a.name,
                complexity_time=a.complexity_time,
                complexity_space=a.complexity_space,
                approach=a.approach,
                code=a.code,
                language=a.language,
                position=i,
            )
            for i, a in enumerate(payload.approaches)
        ]

    problem = Problem(
        user_id=user.id,
        title=payload.title,
        topic_id=topic.id,
        difficulty=payload.difficulty,
        status=payload.status,
        solved_at=now if payload.status == "Done" else None,
        statement=payload.statement,
        example_input=payload.ex_in,
        example_output=payload.ex_out,
        approach=payload.approach,
        solution=payload.solution,
        notes=payload.notes,
        leetcode_url=payload.leetcode_url,
        leetcode_id=leetcode_id,
        patterns=resolve_patterns(session, payload.patterns),
        approaches=approaches,
        created_at=now,
        updated_at=now,
    )
    # New non-done problems are due now; completed ones get a short interval.
    revision = Revision(
        user_id=user.id,
        problem_id=problem.id,
        due_at=(now + timedelta(days=6)) if payload.status == "Done" else now,
        interval_days=6 if payload.status == "Done" else 0,
    )
    session.add(problem)
    session.add(revision)
    session.commit()
    session.refresh(problem)
    session.refresh(revision)
    return serialize_problem(problem, revision, now)


@router.patch("/{problem_id}")
def update_problem(
    problem_id: str,
    payload: ProblemUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    problem = _get_owned_problem(session, user, problem_id)

    data = payload.model_dump(exclude_unset=True)

    topic_name = data.pop("topic", None)
    if topic_name is not None:
        problem.topic_id = get_or_create_topic(session, topic_name).id

    pattern_names = data.pop("patterns", None)
    if pattern_names is not None:
        problem.patterns = resolve_patterns(session, pattern_names)

    # Sync approaches list if provided. Build from the parsed payload objects
    # (not the model_dump, whose keys are snake_case) so complexity/language
    # aren't silently dropped.
    if data.pop("approaches", None) is not None and payload.approaches is not None:
        from ..models import ProblemApproach
        problem.approaches = [
            ProblemApproach(
                name=a.name,
                complexity_time=a.complexity_time,
                complexity_space=a.complexity_space,
                approach=a.approach,
                code=a.code,
                language=a.language,
                position=i,
            )
            for i, a in enumerate(payload.approaches)
        ]

    # Checklist progress is stored JSON-encoded on the row.
    checklist_progress = data.pop("checklist_progress", None)
    if checklist_progress is not None:
        problem.checklist_progress = json.dumps(checklist_progress)

    # Resolve leetcode_id if leetcode_url is updated
    if "leetcode_url" in data:
        leetcode_url = data["leetcode_url"]
        if leetcode_url:
            from ..models import LeetCodeQuestion
            lc_q = session.exec(select(LeetCodeQuestion).where(LeetCodeQuestion.leetcode_url == leetcode_url)).first()
            problem.leetcode_id = lc_q.id if lc_q else None
        else:
            problem.leetcode_id = None

    for key, value in data.items():
        setattr(problem, _FIELD_MAP.get(key, key), value)

    # First arrival at "Done" is the solve moment (kept even if status changes later).
    if problem.status == "Done" and problem.solved_at is None:
        problem.solved_at = utcnow()

    problem.updated_at = utcnow()
    session.add(problem)
    session.commit()
    session.refresh(problem)
    return serialize_problem(problem, problem.revision)



@router.get("/{problem_id}/reviews")
def list_problem_reviews(
    problem_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """The problem's grading history, oldest first — powers the revision-history
    panel in the revise session."""
    problem = _get_owned_problem(session, user, problem_id)
    logs = session.exec(
        select(ReviewLog)
        .where(ReviewLog.problem_id == problem.id, ReviewLog.user_id == user.id)
        .order_by(ReviewLog.reviewed_at)
    ).all()
    return [
        {
            "id": log.id,
            "grade": log.grade,
            "intervalDays": log.interval_days,
            "reviewedAt": log.reviewed_at.isoformat() + "Z",
        }
        for log in logs
    ]


@router.delete("/{problem_id}", status_code=204)
def delete_problem(
    problem_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    problem = _get_owned_problem(session, user, problem_id)
    session.delete(problem)  # cascades to its revision + review logs
    session.commit()
    return Response(status_code=204)


@router.post("/{problem_id}/review")
def review_problem(
    problem_id: str,
    payload: GradeIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if payload.grade not in VALID_GRADES:
        raise HTTPException(status_code=422, detail="Invalid grade")
    problem = _get_owned_problem(session, user, problem_id)

    now = utcnow()
    revision = get_or_create_problem_revision(session, user.id, problem.id)
    grade_revision(session, revision, payload.grade, now)
    problem.updated_at = now
    session.add(problem)
    session.commit()
    session.refresh(problem)
    session.refresh(revision)
    return serialize_problem(problem, revision, now)
