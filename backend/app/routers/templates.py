from fastapi import APIRouter, Depends, Response
from sqlmodel import Session

from ..db import get_session
from ..deps import get_current_user
from ..models import User
from ..schemas import ReorderIn, TemplatePatternCreate, TemplatePatternUpdate
from ..serialize import serialize_template_pattern
from ..services import templates as template_service

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("")
def list_patterns(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """This user's template library: patterns (ordered) nested with variations."""
    # No backfill here: the starter library is seeded once at profile creation
    # (see routers/users.py). Re-seeding an empty list would resurrect a library
    # the user deliberately emptied, so we honour the empty state instead.
    rows = template_service.list_patterns(session, user)
    return [serialize_template_pattern(p) for p in rows]


@router.post("", status_code=201)
def create_pattern(
    payload: TemplatePatternCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    pattern = template_service.create_pattern(session, user, payload)
    return serialize_template_pattern(pattern)


@router.post("/reorder")
def reorder_patterns(
    payload: ReorderIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Persist a new top-level ordering from the drag-and-drop list.

    The body is this user's pattern ids in display order. Ids that aren't the
    user's are ignored; any owned pattern the client omits keeps its relative
    order after the listed ones (defensive against a stale client list).
    """
    rows = template_service.reorder_patterns(session, user, payload.ids)
    return [serialize_template_pattern(p) for p in rows]


@router.post("/{pattern_id}/variations/reorder")
def reorder_variations(
    pattern_id: str,
    payload: ReorderIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Reorder one pattern's variations in place (ids preserved, unlike a full
    update which replaces the set). Body: variation ids in display order; ids
    not in this pattern are ignored, omitted ones keep their relative order."""
    pattern = template_service.reorder_variations(session, user, pattern_id, payload.ids)
    return serialize_template_pattern(pattern)


@router.patch("/{pattern_id}")
def update_pattern(
    pattern_id: str,
    payload: TemplatePatternUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    pattern = template_service.update_pattern(session, user, pattern_id, payload)
    return serialize_template_pattern(pattern)


@router.delete("/{pattern_id}", status_code=204)
def delete_pattern(
    pattern_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    template_service.delete_pattern(session, user, pattern_id)
    return Response(status_code=204)
