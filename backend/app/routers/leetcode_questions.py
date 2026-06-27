import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlmodel import Session, col, or_, select

from ..db import get_session
from ..deps import get_current_user
from ..models import LeetCodeQuestion, Problem, Revision, User
from ..utils import utcnow
from .problems import get_or_create_topic

router = APIRouter(prefix="/api/leetcode-questions", tags=["leetcode_questions"])


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


@router.get("")
def list_leetcode_questions(
    q: Optional[str] = None,
    difficulty: Optional[str] = None,
    tag: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    session: Session = Depends(get_session),
):
    stmt = select(LeetCodeQuestion)

    # Search filter (title or description content)
    if q:
        search_pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                col(LeetCodeQuestion.title).like(search_pattern),
                col(LeetCodeQuestion.statement).like(search_pattern),
            )
        )

    # Difficulty filter
    if difficulty and difficulty != "All":
        stmt = stmt.where(LeetCodeQuestion.difficulty == difficulty)

    # Topic tags filter
    if tag and tag != "All":
        stmt = stmt.where(
            col(LeetCodeQuestion.topic_tags).like(f"%\"{tag}\"%")
        )

    # Natural sorting by ID string (cast to integer using SQLite function if needed,
    # but order_by string ID length and value works cleanly)
    stmt = stmt.order_by(func.length(LeetCodeQuestion.id), LeetCodeQuestion.id)

    # Fetch total matching count
    count_stmt = select(LeetCodeQuestion)
    if q:
        search_pattern = f"%{q}%"
        count_stmt = count_stmt.where(
            or_(
                col(LeetCodeQuestion.title).like(search_pattern),
                col(LeetCodeQuestion.statement).like(search_pattern),
            )
        )
    if difficulty and difficulty != "All":
        count_stmt = count_stmt.where(LeetCodeQuestion.difficulty == difficulty)
    if tag and tag != "All":
        count_stmt = count_stmt.where(
            col(LeetCodeQuestion.topic_tags).like(f"%\"{tag}\"%")
        )

    total = session.exec(
        select(func.count()).select_from(count_stmt.subquery())
    ).one()

    # Pagination
    stmt = stmt.offset((page - 1) * limit).limit(limit)
    questions = session.exec(stmt).all()

    return {
        "items": [
            {
                "id": x.id,
                "questionId": x.question_id,
                "title": x.title,
                "difficulty": x.difficulty,
                "statement": x.statement,
                "leetcodeUrl": x.leetcode_url,
                "topicTags": json.loads(x.topic_tags) if x.topic_tags else [],
                "isPaidOnly": x.is_paid_only,
                "likes": x.likes,
                "dislikes": x.dislikes,
                "categoryTitle": x.category_title,
                "hints": json.loads(x.hints) if x.hints else [],
                "solutionContent": x.solution_content,
                "hasSolution": x.has_solution,
                "hasVideoSolution": x.has_video_solution,
                "similarQuestions": json.loads(x.similar_questions)
                if x.similar_questions
                else [],
                "stats": json.loads(x.stats) if x.stats else {},
            }
            for x in questions
        ],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


@router.get("/{id}")
def get_leetcode_question(id: str, session: Session = Depends(get_session)):
    x = session.get(LeetCodeQuestion, id)
    if not x:
        raise HTTPException(status_code=404, detail="Question not found")

    return {
        "id": x.id,
        "questionId": x.question_id,
        "title": x.title,
        "difficulty": x.difficulty,
        "statement": x.statement,
        "leetcodeUrl": x.leetcode_url,
        "topicTags": json.loads(x.topic_tags) if x.topic_tags else [],
        "isPaidOnly": x.is_paid_only,
        "likes": x.likes,
        "dislikes": x.dislikes,
        "categoryTitle": x.category_title,
        "hints": json.loads(x.hints) if x.hints else [],
        "solutionContent": x.solution_content,
        "hasSolution": x.has_solution,
        "hasVideoSolution": x.has_video_solution,
        "similarQuestions": json.loads(x.similar_questions)
        if x.similar_questions
        else [],
        "stats": json.loads(x.stats) if x.stats else {},
    }


@router.post("/{id}/import", status_code=201)
def import_leetcode_question(
    id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    x = session.get(LeetCodeQuestion, id)
    if not x:
        raise HTTPException(status_code=404, detail="Question not found")

    # Check if already imported
    existing = session.exec(
        select(Problem).where(
            Problem.user_id == user.id, Problem.leetcode_url == x.leetcode_url
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=400, detail="Question already imported to your list"
        )

    # Determine topic mapping
    tags = json.loads(x.topic_tags) if x.topic_tags else []
    mapped_topic_name = map_leetcode_tags_to_topic(tags)
    topic = get_or_create_topic(session, mapped_topic_name)

    # Create personal problem
    now = utcnow()
    problem = Problem(
        user_id=user.id,
        title=f"{x.id}. {x.title}",
        topic_id=topic.id,
        difficulty=x.difficulty,
        status="Not started",
        statement=x.statement,
        leetcode_url=x.leetcode_url,
        created_at=now,
        updated_at=now,
    )
    session.add(problem)
    session.commit()
    session.refresh(problem)

    # Create Revision entry
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

    # Import returns serialized personal problem in same style as Problems API
    from ..serialize import serialize_problem

    return serialize_problem(problem, revision, now)
