from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select

from ..db import get_session
from ..models import Pattern, Problem, ReviewLog, Topic
from ..schemas import GradeIn, ProblemCreate, ProblemUpdate
from ..serialize import serialize_problem
from ..srs import VALID_GRADES, schedule
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


@router.get("")
def list_problems(
    topic: str | None = None,
    difficulty: str | None = None,
    status: str | None = None,
    due: bool | None = None,
    session: Session = Depends(get_session),
):
    stmt = select(Problem).order_by(Problem.created_at.desc())
    if difficulty:
        stmt = stmt.where(Problem.difficulty == difficulty)
    if status:
        stmt = stmt.where(Problem.status == status)
    if topic:
        stmt = stmt.join(Topic).where((Topic.slug == topic) | (Topic.name == topic))

    now = utcnow()
    rows = [serialize_problem(p, now) for p in session.exec(stmt).all()]
    if due is True:
        rows = [r for r in rows if r["due"]]
    return rows


@router.get("/{problem_id}")
def get_problem(problem_id: str, session: Session = Depends(get_session)):
    problem = session.get(Problem, problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    return serialize_problem(problem)


@router.post("", status_code=201)
def create_problem(payload: ProblemCreate, session: Session = Depends(get_session)):
    topic = get_or_create_topic(session, payload.topic)
    now = utcnow()
    problem = Problem(
        title=payload.title,
        topic_id=topic.id,
        difficulty=payload.difficulty,
        status=payload.status,
        statement=payload.statement,
        example_input=payload.ex_in,
        example_output=payload.ex_out,
        approach=payload.approach,
        solution=payload.solution,
        notes=payload.notes,
        leetcode_url=payload.leetcode_url,
        patterns=resolve_patterns(session, payload.patterns),
        # New non-done problems are due now; completed ones get a short interval.
        due_at=(now + timedelta(days=6)) if payload.status == "Done" else now,
        interval_days=6 if payload.status == "Done" else 0,
        created_at=now,
        updated_at=now,
    )
    session.add(problem)
    session.commit()
    session.refresh(problem)
    return serialize_problem(problem)


@router.patch("/{problem_id}")
def update_problem(
    problem_id: str, payload: ProblemUpdate, session: Session = Depends(get_session)
):
    problem = session.get(Problem, problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")

    data = payload.model_dump(exclude_unset=True)

    topic_name = data.pop("topic", None)
    if topic_name is not None:
        problem.topic_id = get_or_create_topic(session, topic_name).id

    pattern_names = data.pop("patterns", None)
    if pattern_names is not None:
        problem.patterns = resolve_patterns(session, pattern_names)

    for key, value in data.items():
        setattr(problem, _FIELD_MAP.get(key, key), value)

    problem.updated_at = utcnow()
    session.add(problem)
    session.commit()
    session.refresh(problem)
    return serialize_problem(problem)


@router.delete("/{problem_id}", status_code=204)
def delete_problem(problem_id: str, session: Session = Depends(get_session)):
    problem = session.get(Problem, problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    session.delete(problem)
    session.commit()
    return Response(status_code=204)


@router.post("/{problem_id}/review")
def review_problem(
    problem_id: str, payload: GradeIn, session: Session = Depends(get_session)
):
    if payload.grade not in VALID_GRADES:
        raise HTTPException(status_code=422, detail="Invalid grade")
    problem = session.get(Problem, problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")

    now = utcnow()
    result = schedule(
        problem.ease_factor,
        problem.interval_days,
        problem.repetitions,
        payload.grade,
        now,
    )
    problem.ease_factor = result["ease_factor"]
    problem.interval_days = result["interval_days"]
    problem.repetitions = result["repetitions"]
    problem.review_count += 1
    problem.last_reviewed_at = now
    problem.due_at = result["due_at"]
    problem.updated_at = now

    session.add(
        ReviewLog(
            grade=payload.grade,
            interval_days=result["interval_days"],
            ease_factor=result["ease_factor"],
            problem_id=problem.id,
            reviewed_at=now,
        )
    )
    session.add(problem)
    session.commit()
    session.refresh(problem)
    return serialize_problem(problem)
