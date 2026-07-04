from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlmodel import Session, delete, or_, select

from ..db import get_session
from ..deps import get_current_user
from ..models import Curriculum, CurriculumQuestionLink, LeetCodeQuestion, User
from ..schemas import CurriculumCreate, CurriculumQuestionsUpdate
from ..utils import slugify, utcnow

router = APIRouter(prefix="/api/curriculums", tags=["curriculums"])


def _require_owned(c: Curriculum, user: User) -> None:
    """Mutations and deletes require ownership. Global (seeded) curriculums are
    read-only through the API — they're populated by the seed script only, so a
    request must never be able to add to, remove from, or delete a shared list."""
    if c.user_id is None or c.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")


@router.get("")
def list_curriculums(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Retrieve global curriculums + user-specific curriculums
    stmt = select(Curriculum).where(
        or_(Curriculum.user_id.is_(None), Curriculum.user_id == user.id)
    )
    curriculums = session.exec(stmt).all()

    res = []
    for c in curriculums:
        count_stmt = select(func.count()).select_from(CurriculumQuestionLink).where(
            CurriculumQuestionLink.curriculum_id == c.id
        )
        q_count = session.exec(count_stmt).one()
        res.append({
            "id": c.id,
            "name": c.name,
            "slug": c.slug,
            "description": c.description,
            "userId": c.user_id,
            "isGlobal": c.user_id is None,
            "questionCount": q_count,
            "createdAt": c.created_at,
            "updatedAt": c.updated_at,
        })
    return res


@router.post("", status_code=201)
def create_curriculum(
    data: CurriculumCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    base_slug = slugify(data.name)
    slug = base_slug
    counter = 1
    # Ensure slug uniqueness
    while session.exec(select(Curriculum).where(Curriculum.slug == slug)).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    now = utcnow()
    curriculum = Curriculum(
        name=data.name,
        slug=slug,
        description=data.description,
        # Curriculums created via the API are always user-owned. Global lists
        # can only be created by the seed script, never by a client request.
        user_id=user.id,
        created_at=now,
        updated_at=now,
    )
    session.add(curriculum)
    session.commit()
    session.refresh(curriculum)

    return {
        "id": curriculum.id,
        "name": curriculum.name,
        "slug": curriculum.slug,
        "description": curriculum.description,
        "userId": curriculum.user_id,
        "isGlobal": curriculum.user_id is None,
        "questionCount": 0,
        "createdAt": curriculum.created_at,
        "updatedAt": curriculum.updated_at,
    }


@router.get("/{id_or_slug}")
def get_curriculum(
    id_or_slug: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    c = session.exec(
        select(Curriculum).where(
            or_(Curriculum.id == id_or_slug, Curriculum.slug == id_or_slug)
        )
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Curriculum not found")

    if c.user_id is not None and c.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Fetch all linked questions
    stmt = (
        select(LeetCodeQuestion)
        .join(
            CurriculumQuestionLink,
            LeetCodeQuestion.id == CurriculumQuestionLink.leetcode_id,
        )
        .where(CurriculumQuestionLink.curriculum_id == c.id)
        .order_by(func.length(LeetCodeQuestion.id), LeetCodeQuestion.id)
    )
    questions = session.exec(stmt).all()

    return {
        "id": c.id,
        "name": c.name,
        "slug": c.slug,
        "description": c.description,
        "userId": c.user_id,
        "isGlobal": c.user_id is None,
        "questions": [
            {
                "id": q.id,
                "questionId": q.question_id,
                "title": q.title,
                "difficulty": q.difficulty,
                "leetcodeUrl": q.leetcode_url,
            }
            for q in questions
        ],
        "createdAt": c.created_at,
        "updatedAt": c.updated_at,
    }


@router.post("/{id}/questions", status_code=201)
def add_questions_to_curriculum(
    id: str,
    data: CurriculumQuestionsUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    c = session.get(Curriculum, id)
    if not c:
        raise HTTPException(status_code=404, detail="Curriculum not found")

    _require_owned(c, user)

    added_count = 0
    for q_id in data.question_ids:
        q = session.get(LeetCodeQuestion, q_id)
        if not q:
            continue

        existing_link = session.get(CurriculumQuestionLink, (c.id, q.id))
        if not existing_link:
            link = CurriculumQuestionLink(curriculum_id=c.id, leetcode_id=q.id)
            session.add(link)
            added_count += 1

    if added_count > 0:
        c.updated_at = utcnow()
        session.add(c)
        session.commit()

    return {"addedCount": added_count}


@router.delete("/{id}/questions/{leetcode_id}", status_code=204)
def remove_question_from_curriculum(
    id: str,
    leetcode_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    c = session.get(Curriculum, id)
    if not c:
        raise HTTPException(status_code=404, detail="Curriculum not found")

    _require_owned(c, user)

    link = session.get(CurriculumQuestionLink, (c.id, leetcode_id))
    if link:
        session.delete(link)
        c.updated_at = utcnow()
        session.add(c)
        session.commit()

    return None


@router.delete("/{id}", status_code=204)
def delete_curriculum(
    id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    c = session.get(Curriculum, id)
    if not c:
        raise HTTPException(status_code=404, detail="Curriculum not found")

    _require_owned(c, user)

    # Clear all linked questions
    session.exec(
        delete(CurriculumQuestionLink).where(
            CurriculumQuestionLink.curriculum_id == c.id
        )
    )
    session.delete(c)
    session.commit()

    return None
