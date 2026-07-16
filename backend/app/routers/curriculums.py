from fastapi import APIRouter, Depends
from sqlmodel import Session

from ..db import get_session
from ..deps import get_current_user
from ..models import User
from ..schemas import CurriculumCreate, CurriculumQuestionsUpdate
from ..serialize import serialize_curriculum, serialize_curriculum_detail
from ..services import curriculums as curriculum_service

router = APIRouter(prefix="/api/curriculums", tags=["curriculums"])


@router.get("")
def list_curriculums(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return [
        serialize_curriculum(c, count)
        for c, count in curriculum_service.list_curriculums_with_counts(session, user)
    ]


@router.post("", status_code=201)
def create_curriculum(
    data: CurriculumCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    curriculum = curriculum_service.create_curriculum(session, user, data)
    return serialize_curriculum(curriculum, 0)


@router.get("/{id_or_slug}")
def get_curriculum(
    id_or_slug: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    curriculum = curriculum_service.get_readable_curriculum(session, user, id_or_slug)
    questions = curriculum_service.list_questions(session, curriculum)
    return serialize_curriculum_detail(curriculum, questions)


@router.post("/{id}/questions", status_code=201)
def add_questions_to_curriculum(
    id: str,
    data: CurriculumQuestionsUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    curriculum = curriculum_service.get_owned_curriculum(session, user, id)
    added = curriculum_service.add_questions(session, curriculum, data.question_ids)
    return {"addedCount": added}


@router.delete("/{id}/questions/{leetcode_id}", status_code=204)
def remove_question_from_curriculum(
    id: str,
    leetcode_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    curriculum = curriculum_service.get_owned_curriculum(session, user, id)
    curriculum_service.remove_question(session, curriculum, leetcode_id)
    return None


@router.delete("/{id}", status_code=204)
def delete_curriculum(
    id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    curriculum = curriculum_service.get_owned_curriculum(session, user, id)
    curriculum_service.delete_curriculum(session, curriculum)
    return None
