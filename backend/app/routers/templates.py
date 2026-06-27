from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..models import Template

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("")
def list_templates(session: Session = Depends(get_session)):
    rows = session.exec(select(Template).order_by(Template.name)).all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "tag": t.tag,
            "concept": t.concept,
            "whenToUse": t.when_to_use,
            "code": t.code,
        }
        for t in rows
    ]
