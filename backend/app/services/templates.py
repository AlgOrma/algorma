"""Template-library business logic (TemplatePattern + its TemplateVariation rows)."""

from sqlmodel import Session, select

from ..models import TemplatePattern, TemplateVariation, User
from ..schemas import TemplatePatternCreate, TemplatePatternUpdate, VariationIn
from ..utils import utcnow
from .common import get_owned


def build_variations(items: list[VariationIn]) -> list[TemplateVariation]:
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


def get_owned_pattern(
    session: Session, user: User, pattern_id: str
) -> TemplatePattern:
    return get_owned(session, TemplatePattern, pattern_id, user, label="Pattern")


def list_patterns(session: Session, user: User) -> list[TemplatePattern]:
    """This user's patterns in display order."""
    return session.exec(
        select(TemplatePattern)
        .where(TemplatePattern.user_id == user.id)
        .order_by(TemplatePattern.position, TemplatePattern.created_at)
    ).all()


def create_pattern(
    session: Session, user: User, payload: TemplatePatternCreate
) -> TemplatePattern:
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
        variations=build_variations(payload.variations),
        created_at=now,
        updated_at=now,
    )
    session.add(pattern)
    session.commit()
    session.refresh(pattern)
    return pattern


def reorder_patterns(
    session: Session, user: User, ids: list[str]
) -> list[TemplatePattern]:
    """Persist a new top-level ordering from the drag-and-drop list.

    ``ids`` is this user's pattern ids in display order. Ids that aren't the
    user's are ignored; any owned pattern the client omits keeps its relative
    order after the listed ones (defensive against a stale client list).
    """
    rows = list_patterns(session, user)
    by_id = {p.id: p for p in rows}

    now = utcnow()
    ordered_ids = [pid for pid in ids if pid in by_id]
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
    return list_patterns(session, user)


def reorder_variations(
    session: Session, user: User, pattern_id: str, ids: list[str]
) -> TemplatePattern:
    """Reorder one pattern's variations in place (ids preserved, unlike a full
    update which replaces the set). ``ids`` is variation ids in display order;
    ids not in this pattern are ignored, omitted ones keep their relative order."""
    pattern = get_owned_pattern(session, user, pattern_id)
    by_id = {v.id: v for v in pattern.variations}

    ordered_ids = [vid for vid in ids if vid in by_id]
    seen = set(ordered_ids)
    current = sorted(pattern.variations, key=lambda v: v.position)
    final_order = ordered_ids + [v.id for v in current if v.id not in seen]

    now = utcnow()
    for position, vid in enumerate(final_order):
        variation = by_id[vid]
        if variation.position != position:
            variation.position = position
            variation.updated_at = now
            session.add(variation)

    pattern.updated_at = now
    session.add(pattern)
    session.commit()
    session.refresh(pattern)
    return pattern


def update_pattern(
    session: Session, user: User, pattern_id: str, payload: TemplatePatternUpdate
) -> TemplatePattern:
    pattern = get_owned_pattern(session, user, pattern_id)

    data = payload.model_dump(exclude_unset=True)
    for field in ("name", "topic", "description"):
        if field in data:
            setattr(pattern, field, data[field])

    # A provided `variations` fully replaces the set (cascade deletes the old
    # rows); omitting it leaves variations untouched.
    if payload.variations is not None:
        pattern.variations = build_variations(payload.variations)

    pattern.updated_at = utcnow()
    session.add(pattern)
    session.commit()
    session.refresh(pattern)
    return pattern


def delete_pattern(session: Session, user: User, pattern_id: str) -> None:
    pattern = get_owned_pattern(session, user, pattern_id)
    session.delete(pattern)  # cascades to its variations
    session.commit()
