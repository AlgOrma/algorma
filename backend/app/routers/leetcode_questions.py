import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func
from sqlmodel import Session, col, or_, select

from ..db import get_session
from ..deps import get_current_user
from ..models import LeetCodeQuestion, Problem, Revision, User, Curriculum, CurriculumQuestionLink
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
    curriculum: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    session: Session = Depends(get_session),
):
    # Build the filter conditions once and reuse them for both the page query
    # and the total count, so the two can never drift apart.
    conditions = []
    q_clean = q.strip() if q else ""

    if q_clean:
        pattern = f"%{q_clean}%"
        search_conds = [
            col(LeetCodeQuestion.title).like(pattern),
            col(LeetCodeQuestion.statement).like(pattern),
        ]
        # A purely numeric query also matches the question number exactly
        # (e.g. "1" finds question #1, not just titles containing "1").
        if q_clean.isdigit():
            search_conds.append(LeetCodeQuestion.id == q_clean)
        conditions.append(or_(*search_conds))

    if difficulty and difficulty != "All":
        conditions.append(LeetCodeQuestion.difficulty == difficulty)

    if tag and tag != "All":
        conditions.append(col(LeetCodeQuestion.topic_tags).like(f'%"{tag}"%'))

    if curriculum and curriculum != "All":
        curriculum_obj = session.exec(
            select(Curriculum).where(
                or_(Curriculum.slug == curriculum, Curriculum.id == curriculum)
            )
        ).first()
        if curriculum_obj:
            conditions.append(
                col(LeetCodeQuestion.id).in_(
                    select(CurriculumQuestionLink.leetcode_id).where(
                        CurriculumQuestionLink.curriculum_id == curriculum_obj.id
                    )
                )
            )


    stmt = select(LeetCodeQuestion)
    for cond in conditions:
        stmt = stmt.where(cond)

    if q_clean:
        # Relevance ranking: exact question number first, then exact title,
        # title prefix, title substring, and finally statement-only matches.
        # Ties within a tier fall back to natural question-number order.
        q_lower = q_clean.lower()
        title_lower = func.lower(LeetCodeQuestion.title)
        relevance = case(
            (LeetCodeQuestion.id == q_clean, 0),
            (title_lower == q_lower, 1),
            (title_lower.like(f"{q_lower}%"), 2),
            (title_lower.like(f"%{q_lower}%"), 3),
            else_=4,
        )
        stmt = stmt.order_by(
            relevance, func.length(LeetCodeQuestion.id), LeetCodeQuestion.id
        )
    else:
        # Natural sorting by ID string: length first, then value, so 1, 2, … 10
        # order numerically rather than lexicographically.
        stmt = stmt.order_by(func.length(LeetCodeQuestion.id), LeetCodeQuestion.id)

    count_stmt = select(func.count()).select_from(LeetCodeQuestion)
    for cond in conditions:
        count_stmt = count_stmt.where(cond)
    total = session.exec(count_stmt).one()

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
