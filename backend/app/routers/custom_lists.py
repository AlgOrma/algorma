from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func
from sqlalchemy.orm import selectinload
from sqlmodel import Session, delete, select

from ..db import get_session
from ..deps import get_current_user
from ..models import CustomList, CustomListProblemLink, Problem, User
from ..schemas import CustomListCreate, CustomListProblemsUpdate, CustomListUpdate
from ..serialize import serialize_problem
from ..utils import utcnow

router = APIRouter(prefix="/api/custom-lists", tags=["custom-lists"])


def _require_owned(c: CustomList, user: User) -> None:
    if c.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")


@router.get("")
def list_custom_lists(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    stmt = select(CustomList).where(CustomList.user_id == user.id).order_by(CustomList.created_at.desc())
    custom_lists = session.exec(stmt).all()

    res = []
    for cl in custom_lists:
        count_stmt = select(func.count()).select_from(CustomListProblemLink).where(
            CustomListProblemLink.custom_list_id == cl.id
        )
        p_count = session.exec(count_stmt).one()
        res.append({
            "id": cl.id,
            "name": cl.name,
            "description": cl.description,
            "problemCount": p_count,
            "createdAt": cl.created_at.isoformat() + "Z",
            "updatedAt": cl.updated_at.isoformat() + "Z",
        })
    return res


@router.post("", status_code=201)
def create_custom_list(
    data: CustomListCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    now = utcnow()
    cl = CustomList(
        name=data.name,
        description=data.description,
        user_id=user.id,
        created_at=now,
        updated_at=now,
    )
    session.add(cl)
    session.commit()
    session.refresh(cl)

    return {
        "id": cl.id,
        "name": cl.name,
        "description": cl.description,
        "problemCount": 0,
        "createdAt": cl.created_at.isoformat() + "Z",
        "updatedAt": cl.updated_at.isoformat() + "Z",
    }


@router.get("/{id}")
def get_custom_list(
    id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    cl = session.get(CustomList, id)
    if not cl:
        raise HTTPException(status_code=404, detail="Custom list not found")

    _require_owned(cl, user)

    # Fetch all linked problems with eager load options
    stmt = (
        select(Problem)
        .join(CustomListProblemLink, Problem.id == CustomListProblemLink.problem_id)
        .where(CustomListProblemLink.custom_list_id == cl.id)
        .options(
            selectinload(Problem.approaches),
            selectinload(Problem.leetcode_question),
            selectinload(Problem.topic),
            selectinload(Problem.patterns),
            selectinload(Problem.revision),
            selectinload(Problem.custom_lists),
        )
        .order_by(CustomListProblemLink.created_at.desc())
    )
    problems = session.exec(stmt).all()

    now = utcnow()
    serialized_problems = [serialize_problem(p, p.revision, now) for p in problems]

    return {
        "id": cl.id,
        "name": cl.name,
        "description": cl.description,
        "userId": cl.user_id,
        "problems": serialized_problems,
        "createdAt": cl.created_at.isoformat() + "Z",
        "updatedAt": cl.updated_at.isoformat() + "Z",
    }


@router.patch("/{id}")
def update_custom_list(
    id: str,
    data: CustomListUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    cl = session.get(CustomList, id)
    if not cl:
        raise HTTPException(status_code=404, detail="Custom list not found")

    _require_owned(cl, user)

    if data.name is not None:
        cl.name = data.name
    if data.description is not None:
        cl.description = data.description

    cl.updated_at = utcnow()
    session.add(cl)
    session.commit()
    session.refresh(cl)

    return {
        "id": cl.id,
        "name": cl.name,
        "description": cl.description,
        "createdAt": cl.created_at.isoformat() + "Z",
        "updatedAt": cl.updated_at.isoformat() + "Z",
    }


@router.delete("/{id}", status_code=204)
def delete_custom_list(
    id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    cl = session.get(CustomList, id)
    if not cl:
        raise HTTPException(status_code=404, detail="Custom list not found")

    _require_owned(cl, user)

    # Clear all linked problems
    session.exec(
        delete(CustomListProblemLink).where(
            CustomListProblemLink.custom_list_id == cl.id
        )
    )
    session.delete(cl)
    session.commit()

    return Response(status_code=204)


@router.post("/{id}/problems", status_code=201)
def add_problems_to_custom_list(
    id: str,
    data: CustomListProblemsUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    cl = session.get(CustomList, id)
    if not cl:
        raise HTTPException(status_code=404, detail="Custom list not found")

    _require_owned(cl, user)

    added_count = 0
    for p_id in data.problem_ids:
        # Check problem exists and belongs to user
        p = session.get(Problem, p_id)
        if not p or p.user_id != user.id:
            continue

        existing_link = session.get(CustomListProblemLink, (cl.id, p.id))
        if not existing_link:
            link = CustomListProblemLink(custom_list_id=cl.id, problem_id=p.id)
            session.add(link)
            added_count += 1

    if added_count > 0:
        cl.updated_at = utcnow()
        session.add(cl)
        session.commit()

    return {"addedCount": added_count}


@router.delete("/{id}/problems/{problem_id}", status_code=204)
def remove_problem_from_custom_list(
    id: str,
    problem_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    cl = session.get(CustomList, id)
    if not cl:
        raise HTTPException(status_code=404, detail="Custom list not found")

    _require_owned(cl, user)

    link = session.get(CustomListProblemLink, (cl.id, problem_id))
    if link:
        session.delete(link)
        cl.updated_at = utcnow()
        session.add(cl)
        session.commit()

    return Response(status_code=204)
