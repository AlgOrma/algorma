"""Curriculum business logic.

Ownership here differs from the other domains: rows with ``user_id=None`` are
global (seeded) lists — readable by everyone, mutable by no one — so the checks
answer 403 rather than folding into the generic 404-based ``common.get_owned``.
"""

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import Session, delete, or_, select

from ..models import Curriculum, CurriculumQuestionLink, LeetCodeQuestion, User
from ..schemas import CurriculumCreate
from ..utils import slugify, utcnow


def _require_owned(c: Curriculum, user: User) -> None:
    """Mutations and deletes require ownership. Global (seeded) curriculums are
    read-only through the API — they're populated by the seed script only, so a
    request must never be able to add to, remove from, or delete a shared list."""
    if c.user_id is None or c.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")


def list_curriculums_with_counts(
    session: Session, user: User
) -> list[tuple[Curriculum, int]]:
    """Global curriculums plus this user's own, each with its question count."""
    curriculums = session.exec(
        select(Curriculum).where(
            or_(Curriculum.user_id.is_(None), Curriculum.user_id == user.id)
        )
    ).all()

    result = []
    for c in curriculums:
        count_stmt = (
            select(func.count())
            .select_from(CurriculumQuestionLink)
            .where(CurriculumQuestionLink.curriculum_id == c.id)
        )
        result.append((c, session.exec(count_stmt).one()))
    return result


def create_curriculum(
    session: Session, user: User, payload: CurriculumCreate
) -> Curriculum:
    base_slug = slugify(payload.name)
    slug = base_slug
    counter = 1
    # Ensure slug uniqueness
    while session.exec(select(Curriculum).where(Curriculum.slug == slug)).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    now = utcnow()
    curriculum = Curriculum(
        name=payload.name,
        slug=slug,
        description=payload.description,
        # Curriculums created via the API are always user-owned. Global lists
        # can only be created by the seed script, never by a client request.
        user_id=user.id,
        created_at=now,
        updated_at=now,
    )
    session.add(curriculum)
    session.commit()
    session.refresh(curriculum)
    return curriculum


def get_readable_curriculum(
    session: Session, user: User, id_or_slug: str
) -> Curriculum:
    """Load by id or slug for reading: global lists are visible to everyone,
    private lists only to their owner."""
    c = session.exec(
        select(Curriculum).where(
            or_(Curriculum.id == id_or_slug, Curriculum.slug == id_or_slug)
        )
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Curriculum not found")
    if c.user_id is not None and c.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return c


def get_owned_curriculum(
    session: Session, user: User, curriculum_id: str
) -> Curriculum:
    """Load by id for mutation: 404 if missing, 403 unless owned by this user."""
    c = session.get(Curriculum, curriculum_id)
    if not c:
        raise HTTPException(status_code=404, detail="Curriculum not found")
    _require_owned(c, user)
    return c


def list_questions(
    session: Session, curriculum: Curriculum
) -> list[LeetCodeQuestion]:
    """The curriculum's linked questions in natural question-number order."""
    return session.exec(
        select(LeetCodeQuestion)
        .join(
            CurriculumQuestionLink,
            LeetCodeQuestion.id == CurriculumQuestionLink.leetcode_id,
        )
        .where(CurriculumQuestionLink.curriculum_id == curriculum.id)
        .order_by(func.length(LeetCodeQuestion.id), LeetCodeQuestion.id)
    ).all()


def add_questions(
    session: Session, curriculum: Curriculum, question_ids: list[str]
) -> int:
    """Link the given catalog questions, skipping unknown ids and existing
    links. Returns how many links were actually added."""
    added_count = 0
    for q_id in question_ids:
        q = session.get(LeetCodeQuestion, q_id)
        if not q:
            continue

        existing_link = session.get(CurriculumQuestionLink, (curriculum.id, q.id))
        if not existing_link:
            link = CurriculumQuestionLink(curriculum_id=curriculum.id, leetcode_id=q.id)
            session.add(link)
            added_count += 1

    if added_count > 0:
        curriculum.updated_at = utcnow()
        session.add(curriculum)
        session.commit()

    return added_count


def remove_question(
    session: Session, curriculum: Curriculum, leetcode_id: str
) -> None:
    link = session.get(CurriculumQuestionLink, (curriculum.id, leetcode_id))
    if link:
        session.delete(link)
        curriculum.updated_at = utcnow()
        session.add(curriculum)
        session.commit()


def delete_curriculum(session: Session, curriculum: Curriculum) -> None:
    # Clear all linked questions
    session.exec(
        delete(CurriculumQuestionLink).where(
            CurriculumQuestionLink.curriculum_id == curriculum.id
        )
    )
    session.delete(curriculum)
    session.commit()
