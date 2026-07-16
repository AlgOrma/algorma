"""Catalog queries for the global LeetCode question cache."""

from fastapi import HTTPException
from sqlalchemy import case, func
from sqlmodel import Session, col, or_, select

from ..models import Curriculum, CurriculumQuestionLink, LeetCodeQuestion


def get_question(session: Session, question_id: str) -> LeetCodeQuestion:
    question = session.get(LeetCodeQuestion, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


def search_questions(
    session: Session,
    *,
    q: str | None = None,
    difficulty: str | None = None,
    tag: str | None = None,
    curriculum: str | None = None,
    page: int = 1,
    limit: int = 50,
) -> tuple[list[LeetCodeQuestion], int]:
    """Filtered, relevance-ranked catalog search.

    Returns one page of questions plus the total match count.
    """
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

    stmt = stmt.offset((page - 1) * limit).limit(limit)
    questions = session.exec(stmt).all()

    return questions, total
