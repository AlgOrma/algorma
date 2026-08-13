from fastapi import APIRouter, Depends
from sqlmodel import Session

from ..db import get_session
from ..deps import get_current_user
from ..models import User
from ..schemas import DeckCreate, DeckUpdate
from ..serialize import serialize_deck
from ..services import decks as deck_service
from ..utils import utcnow

router = APIRouter(prefix="/api/decks", tags=["decks"])


@router.get("")
def list_decks(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    now = utcnow()
    decks = deck_service.list_decks(session, user)
    # list_decks eager-loads flashcards + revisions, so no per-deck N+1 here.
    return [serialize_deck(d, cards=d.flashcards, now=now) for d in decks]


@router.post("", status_code=201)
def create_deck(
    payload: DeckCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    deck = deck_service.create_deck(session, user, payload)
    return serialize_deck(deck)


@router.get("/{deck_id}")
def get_deck(
    deck_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    deck = deck_service.get_deck(session, user, deck_id)
    return serialize_deck(deck)


@router.patch("/{deck_id}")
def update_deck(
    deck_id: str,
    payload: DeckUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    deck = deck_service.update_deck(session, user, deck_id, payload)
    return serialize_deck(deck)


@router.delete("/{deck_id}", status_code=204)
def delete_deck(
    deck_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    deck_service.delete_deck(session, user, deck_id)
    return None
