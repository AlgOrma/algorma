"""Problem business logic: topic/pattern resolution, the create/update/grade
write flows, and imports from the LeetCode catalog."""

import json
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from ..models import (
    LeetCodeQuestion,
    Pattern,
    Problem,
    ProblemApproach,
    ReviewLog,
    Revision,
    Topic,
    User,
)
from ..revisions import get_or_create_problem_revision, grade_revision
from ..schemas import ProblemApproachIn, ProblemCreate, ProblemUpdate
from ..utils import slugify, utcnow
from .common import get_owned, require_valid_grade

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


def resolve_leetcode_id(session: Session, leetcode_url: str | None) -> str | None:
    """The catalog row matching a problem's LeetCode URL, if we have it."""
    if not leetcode_url:
        return None
    question = session.exec(
        select(LeetCodeQuestion).where(LeetCodeQuestion.leetcode_url == leetcode_url)
    ).first()
    return question.id if question else None


def build_approaches(items: list[ProblemApproachIn]) -> list[ProblemApproach]:
    """Map the frontend's approach payloads to ordered DB rows."""
    return [
        ProblemApproach(
            name=a.name,
            complexity_time=a.complexity_time,
            complexity_space=a.complexity_space,
            approach=a.approach,
            code=a.code,
            language=a.language,
            position=i,
        )
        for i, a in enumerate(items)
    ]


def get_owned_problem(session: Session, user: User, problem_id: str) -> Problem:
    return get_owned(session, Problem, problem_id, user, label="Problem")


def list_problems(
    session: Session,
    user: User,
    *,
    topic: str | None = None,
    difficulty: str | None = None,
    status: str | None = None,
) -> list[Problem]:
    stmt = (
        select(Problem)
        .where(Problem.user_id == user.id)
        .options(
            selectinload(Problem.approaches),
            selectinload(Problem.leetcode_question),
            selectinload(Problem.topic),
            selectinload(Problem.patterns),
            selectinload(Problem.revision),
            selectinload(Problem.custom_lists),
        )
        .order_by(Problem.created_at.desc())
    )
    if difficulty:
        stmt = stmt.where(Problem.difficulty == difficulty)
    if status:
        stmt = stmt.where(Problem.status == status)
    if topic:
        stmt = stmt.join(Topic).where((Topic.slug == topic) | (Topic.name == topic))
    return session.exec(stmt).all()


def create_problem(
    session: Session, user: User, payload: ProblemCreate
) -> tuple[Problem, Revision, datetime]:
    topic = get_or_create_topic(session, payload.topic)
    now = utcnow()

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
        leetcode_id=resolve_leetcode_id(session, payload.leetcode_url),
        patterns=resolve_patterns(session, payload.patterns),
        approaches=build_approaches(payload.approaches or []),
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
    return problem, revision, now


def update_problem(
    session: Session, user: User, problem_id: str, payload: ProblemUpdate
) -> Problem:
    problem = get_owned_problem(session, user, problem_id)

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
        problem.approaches = build_approaches(payload.approaches)

    # Checklist progress is stored JSON-encoded on the row.
    checklist_progress = data.pop("checklist_progress", None)
    if checklist_progress is not None:
        problem.checklist_progress = json.dumps(checklist_progress)

    # A changed URL re-links (or unlinks) the catalog reference; the URL field
    # itself is still applied by the setattr loop below.
    if "leetcode_url" in data:
        problem.leetcode_id = resolve_leetcode_id(session, data["leetcode_url"])

    for key, value in data.items():
        setattr(problem, _FIELD_MAP.get(key, key), value)

    # First arrival at "Done" is the solve moment (kept even if status changes later).
    if problem.status == "Done" and problem.solved_at is None:
        problem.solved_at = utcnow()

    problem.updated_at = utcnow()
    session.add(problem)
    session.commit()
    session.refresh(problem)
    return problem


def delete_problem(session: Session, user: User, problem_id: str) -> None:
    problem = get_owned_problem(session, user, problem_id)
    session.delete(problem)  # cascades to its revision + review logs
    session.commit()


def list_problem_reviews(
    session: Session, user: User, problem_id: str
) -> list[ReviewLog]:
    """The problem's grading history, oldest first."""
    problem = get_owned_problem(session, user, problem_id)
    return session.exec(
        select(ReviewLog)
        .where(ReviewLog.problem_id == problem.id, ReviewLog.user_id == user.id)
        .order_by(ReviewLog.reviewed_at)
    ).all()


def review_problem(
    session: Session, user: User, problem_id: str, grade: str
) -> tuple[Problem, Revision, datetime]:
    require_valid_grade(grade)
    problem = get_owned_problem(session, user, problem_id)

    now = utcnow()
    revision = get_or_create_problem_revision(session, user.id, problem.id)
    grade_revision(session, revision, grade, now)
    problem.updated_at = now
    session.add(problem)
    session.commit()
    session.refresh(problem)
    session.refresh(revision)
    return problem, revision, now


def map_leetcode_tags_to_topic(tags: list[str]) -> str:
    mapping = {
        "array": "Arrays",
        "hash table": "Hashing",
        "two pointers": "Two Pointers",
        "tree": "Trees",
        "binary tree": "Trees",
        "graph": "Graphs",
        "binary search": "Binary Search",
        "dynamic programming": "Dynamic Prog.",
        "heap (priority queue)": "Heaps",
        "heap": "Heaps",
        "stack": "Stacks",
    }
    for tag in tags:
        tag_lower = tag.lower()
        if tag_lower in mapping:
            return mapping[tag_lower]
    if tags:
        # Capitalize first letter
        t = tags[0]
        return t if t.istitle() else t.title()
    return "General"


def import_question(
    session: Session, user: User, question: LeetCodeQuestion
) -> tuple[Problem, Revision, datetime]:
    """Copy a catalog question into the user's personal problem list."""
    existing = session.exec(
        select(Problem).where(
            Problem.user_id == user.id, Problem.leetcode_url == question.leetcode_url
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=400, detail="Question already imported to your list"
        )

    tags = json.loads(question.topic_tags) if question.topic_tags else []
    topic = get_or_create_topic(session, map_leetcode_tags_to_topic(tags))

    now = utcnow()
    problem = Problem(
        user_id=user.id,
        title=f"{question.id}. {question.title}",
        topic_id=topic.id,
        difficulty=question.difficulty,
        status="Not started",
        statement=question.statement,
        leetcode_url=question.leetcode_url,
        leetcode_id=question.id,
        created_at=now,
        updated_at=now,
    )
    session.add(problem)
    session.commit()
    session.refresh(problem)

    revision = Revision(
        user_id=user.id,
        problem_id=problem.id,
        due_at=now,
        interval_days=0,
        created_at=now,
        updated_at=now,
    )
    session.add(revision)
    session.commit()
    session.refresh(problem)

    return problem, revision, now
