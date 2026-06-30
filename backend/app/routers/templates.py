from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user
from ..models import TemplatePattern, TemplateVariation, User
from ..schemas import (
    ReorderIn,
    TemplatePatternCreate,
    TemplatePatternUpdate,
    VariationIn,
)
from ..serialize import serialize_template_pattern
from ..utils import utcnow

router = APIRouter(prefix="/api/templates", tags=["templates"])


def _build_variations(items: list[VariationIn]) -> list[TemplateVariation]:
    """Map the frontend's variation payloads to ordered DB rows."""
    return [
        TemplateVariation(
            name=v.name,
            description=v.desc,
            language=v.lang,
            code=v.code,
            position=i,
        )
        for i, v in enumerate(items)
    ]


def _get_owned_pattern(
    session: Session, user: User, pattern_id: str
) -> TemplatePattern:
    pattern = session.get(TemplatePattern, pattern_id)
    if not pattern or pattern.user_id != user.id:
        raise HTTPException(status_code=404, detail="Pattern not found")
    return pattern


@router.get("")
def list_patterns(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """This user's template library: patterns (ordered) nested with variations."""
    stmt = (
        select(TemplatePattern)
        .where(TemplatePattern.user_id == user.id)
        .order_by(TemplatePattern.position, TemplatePattern.created_at)
    )
    rows = session.exec(stmt).all()
    # No backfill here: the starter library is seeded once at profile creation
    # (see routers/users.py). Re-seeding an empty list would resurrect a library
    # the user deliberately emptied, so we honour the empty state instead.
    return [serialize_template_pattern(p) for p in rows]


@router.post("", status_code=201)
def create_pattern(
    payload: TemplatePatternCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # New patterns sort to the top, mirroring the page's "prepend" behaviour.
    positions = session.exec(
        select(TemplatePattern.position).where(TemplatePattern.user_id == user.id)
    ).all()
    top = (min(positions) - 1) if positions else 0

    now = utcnow()
    pattern = TemplatePattern(
        user_id=user.id,
        name=payload.name,
        topic=payload.topic,
        description=payload.description,
        position=top,
        variations=_build_variations(payload.variations),
        created_at=now,
        updated_at=now,
    )
    session.add(pattern)
    session.commit()
    session.refresh(pattern)
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
    rows = session.exec(
        select(TemplatePattern)
        .where(TemplatePattern.user_id == user.id)
        .order_by(TemplatePattern.position, TemplatePattern.created_at)
    ).all()
    by_id = {p.id: p for p in rows}

    now = utcnow()
    ordered_ids = [pid for pid in payload.ids if pid in by_id]
    seen = set(ordered_ids)
    # Listed patterns first (in the given order), then any unlisted owned ones.
    final_order = ordered_ids + [p.id for p in rows if p.id not in seen]

    for position, pid in enumerate(final_order):
        pattern = by_id[pid]
        if pattern.position != position:
            pattern.position = position
            pattern.updated_at = now
            session.add(pattern)

    session.commit()

    rows = session.exec(
        select(TemplatePattern)
        .where(TemplatePattern.user_id == user.id)
        .order_by(TemplatePattern.position, TemplatePattern.created_at)
    ).all()
    return [serialize_template_pattern(p) for p in rows]


@router.patch("/{pattern_id}")
def update_pattern(
    pattern_id: str,
    payload: TemplatePatternUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    pattern = _get_owned_pattern(session, user, pattern_id)

    data = payload.model_dump(exclude_unset=True)
    for field in ("name", "topic", "description"):
        if field in data:
            setattr(pattern, field, data[field])

    # A provided `variations` fully replaces the set (cascade deletes the old
    # rows); omitting it leaves variations untouched.
    if payload.variations is not None:
        pattern.variations = _build_variations(payload.variations)

    pattern.updated_at = utcnow()
    session.add(pattern)
    session.commit()
    session.refresh(pattern)
    return serialize_template_pattern(pattern)


@router.delete("/{pattern_id}", status_code=204)
def delete_pattern(
    pattern_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    pattern = _get_owned_pattern(session, user, pattern_id)
    session.delete(pattern)  # cascades to its variations
    session.commit()
    return Response(status_code=204)
