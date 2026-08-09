"""Deck business logic: CRUD for user flashcard decks."""

from sqlmodel import Session, select

from ..models import Deck, User
from ..schemas import DeckCreate, DeckUpdate
from ..utils import utcnow
from .common import get_owned


def list_decks(session: Session, user: User) -> list[Deck]:
    return session.exec(
        select(Deck)
        .where(Deck.user_id == user.id)
        .order_by(Deck.name)
    ).all()


def create_deck(session: Session, user: User, payload: DeckCreate) -> Deck:
    deck = Deck(
        user_id=user.id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        color=payload.color.strip() if payload.color else None,
    )
    session.add(deck)
    session.commit()
    session.refresh(deck)
    return deck


def get_deck(session: Session, user: User, deck_id: str) -> Deck:
    return get_owned(session, Deck, deck_id, user, label="Deck")


def update_deck(
    session: Session, user: User, deck_id: str, payload: DeckUpdate
) -> Deck:
    deck = get_deck(session, user, deck_id)
    if payload.name is not None:
        deck.name = payload.name.strip()
    if payload.description is not None:
        deck.description = payload.description.strip() if payload.description else None
    if payload.color is not None:
        deck.color = payload.color.strip() if payload.color else None
    deck.updated_at = utcnow()
    session.add(deck)
    session.commit()
    session.refresh(deck)
    return deck


def delete_deck(session: Session, user: User, deck_id: str) -> None:
    deck = get_deck(session, user, deck_id)
    session.delete(deck)
    session.commit()
