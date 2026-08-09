"""Test suite for Deck CRUD and Flashcard CRUD within decks."""

import pytest
from fastapi import HTTPException

from app.models import User
from app.routers.decks import create_deck, delete_deck, get_deck, list_decks, update_deck
from app.routers.flashcards import (
    create_flashcard,
    delete_flashcard,
    list_flashcards,
    update_flashcard,
)
from app.schemas import DeckCreate, DeckUpdate, FlashcardCreate, FlashcardUpdate


def make_user(session, name="Deck User"):
    user = User(name=name)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_deck_crud_flow(session, user):
    # 1. Create deck
    created = create_deck(
        DeckCreate(name="Data Structures", description="Core DS concepts", color="#3b82f6"),
        user=user,
        session=session,
    )
    assert created["name"] == "Data Structures"
    assert created["description"] == "Core DS concepts"
    assert created["color"] == "#3b82f6"
    assert created["cardCount"] == 0
    assert created["dueCount"] == 0
    deck_id = created["id"]

    # 2. List decks
    decks = list_decks(user=user, session=session)
    assert len(decks) == 1
    assert decks[0]["id"] == deck_id

    # 3. Get single deck
    fetched = get_deck(deck_id, user=user, session=session)
    assert fetched["id"] == deck_id
    assert fetched["name"] == "Data Structures"

    # 4. Update deck
    updated = update_deck(
        deck_id,
        DeckUpdate(name="Advanced Data Structures", description="Graphs and Trees"),
        user=user,
        session=session,
    )
    assert updated["name"] == "Advanced Data Structures"
    assert updated["description"] == "Graphs and Trees"

    # 5. Add flashcard under this deck
    card = create_flashcard(
        FlashcardCreate(
            front="What is a Binary Search Tree?",
            back="A node-based tree structure where left subtrees < node and right > node.",
            deck_id=deck_id,
            type="concept",
            tag="Trees",
        ),
        user=user,
        session=session,
    )
    assert card["deckId"] == deck_id
    assert card["deckName"] == "Advanced Data Structures"
    assert card["front"] == "What is a Binary Search Tree?"

    # 6. Verify deck's cardCount updated
    deck_with_card = get_deck(deck_id, user=user, session=session)
    assert deck_with_card["cardCount"] == 1

    # 7. List flashcards filtered by deck_id
    deck_cards = list_flashcards(deck_id=deck_id, user=user, session=session)
    assert len(deck_cards) == 1
    assert deck_cards[0]["id"] == card["id"]

    # 8. Update flashcard
    updated_card = update_flashcard(
        card["id"],
        FlashcardUpdate(front="What is a BST?", tag="Binary Trees"),
        user=user,
        session=session,
    )
    assert updated_card["front"] == "What is a BST?"
    assert updated_card["tag"] == "Binary Trees"

    # 9. Delete card
    delete_flashcard(card["id"], user=user, session=session)
    assert list_flashcards(deck_id=deck_id, user=user, session=session) == []

    # 10. Delete deck
    delete_deck(deck_id, user=user, session=session)
    assert list_decks(user=user, session=session) == []


def test_deck_isolation_between_users(session, user):
    other_user = make_user(session, name="Other User")
    
    deck = create_deck(DeckCreate(name="Private Deck"), user=user, session=session)

    # Other user cannot see or modify this deck
    other_decks = list_decks(user=other_user, session=session)
    assert other_decks == []

    with pytest.raises(HTTPException) as exc:
        get_deck(deck["id"], user=other_user, session=session)
    assert exc.value.status_code == 404
