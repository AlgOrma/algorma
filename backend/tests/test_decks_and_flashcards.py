"""Test suite for Deck CRUD and Flashcard CRUD within decks."""

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlmodel import select

from app.models import ReviewLog, User
from app.routers.decks import create_deck, delete_deck, get_deck, list_decks, update_deck
from app.routers.flashcards import (
    create_flashcard,
    delete_flashcard,
    list_flashcards,
    review_flashcard,
    update_flashcard,
)
from app.schemas import DeckCreate, DeckUpdate, FlashcardCreate, FlashcardUpdate, GradeIn
from app.services.flashcards import UNASSIGNED_DECK_ID


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


def test_blank_deck_name_rejected_on_create_and_update(session, user):
    with pytest.raises(ValidationError):
        create_deck(DeckCreate(name="   "), user=user, session=session)

    deck = create_deck(DeckCreate(name="Keep Me"), user=user, session=session)
    with pytest.raises(ValidationError):
        update_deck(deck["id"], DeckUpdate(name=" \n "), user=user, session=session)


def test_deck_name_is_stripped(session, user):
    deck = create_deck(DeckCreate(name="  Algorithms  "), user=user, session=session)
    assert deck["name"] == "Algorithms"


def test_create_flashcard_normalizes_empty_deck_id(session, user):
    card = create_flashcard(
        FlashcardCreate(front="Q", back="A", deck_id=""),
        user=user,
        session=session,
    )
    assert card["deckId"] is None


def test_delete_deck_detaches_cards_instead_of_cascading(session, user):
    deck = create_deck(DeckCreate(name="To Drop"), user=user, session=session)
    card = create_flashcard(
        FlashcardCreate(front="Q", back="A", deck_id=deck["id"]),
        user=user,
        session=session,
    )

    delete_deck(deck["id"], user=user, session=session)

    assert list_decks(user=user, session=session) == []
    rows = list_flashcards(user=user, session=session)
    assert [r["id"] for r in rows] == [card["id"]]
    assert rows[0]["deckId"] is None


def test_delete_flashcard_preserves_review_logs(session, user):
    card = create_flashcard(
        FlashcardCreate(front="Q", back="A"), user=user, session=session
    )
    review_flashcard(card["id"], GradeIn(grade="Good"), user=user, session=session)

    delete_flashcard(card["id"], user=user, session=session)

    logs = session.exec(select(ReviewLog)).all()
    assert len(logs) == 1
    assert logs[0].flashcard_id is None  # detached, not deleted
    assert logs[0].user_id == user.id


def test_delete_deck_preserves_review_logs(session, user):
    deck = create_deck(DeckCreate(name="Stats Deck"), user=user, session=session)
    card = create_flashcard(
        FlashcardCreate(front="Q", back="A", deck_id=deck["id"]),
        user=user,
        session=session,
    )
    review_flashcard(card["id"], GradeIn(grade="Easy"), user=user, session=session)

    delete_deck(deck["id"], user=user, session=session)

    logs = session.exec(select(ReviewLog)).all()
    assert len(logs) == 1
    assert logs[0].flashcard_id is not None  # card survives detached, log intact
    assert logs[0].grade == "Easy"


# --- deck ownership on card writes ---


def test_create_flashcard_rejects_another_users_deck(session, user):
    other_user = make_user(session, name="Deck Owner")
    their_deck = create_deck(DeckCreate(name="Theirs"), user=other_user, session=session)

    with pytest.raises(HTTPException) as exc:
        create_flashcard(
            FlashcardCreate(front="Q", back="A", deck_id=their_deck["id"]),
            user=user,
            session=session,
        )
    assert exc.value.status_code == 404


def test_update_flashcard_rejects_another_users_deck(session, user):
    other_user = make_user(session, name="Deck Owner")
    their_deck = create_deck(DeckCreate(name="Theirs"), user=other_user, session=session)
    card = create_flashcard(
        FlashcardCreate(front="Q", back="A"), user=user, session=session
    )

    with pytest.raises(HTTPException) as exc:
        update_flashcard(
            card["id"],
            FlashcardUpdate(deck_id=their_deck["id"]),
            user=user,
            session=session,
        )
    assert exc.value.status_code == 404
    # The rejected write left the card where it was.
    assert list_flashcards(user=user, session=session)[0]["deckId"] is None


def test_update_flashcard_deck_id_move_clear_and_leave_alone(session, user):
    first = create_deck(DeckCreate(name="First"), user=user, session=session)
    second = create_deck(DeckCreate(name="Second"), user=user, session=session)
    card = create_flashcard(
        FlashcardCreate(front="Q", back="A", deck_id=first["id"]),
        user=user,
        session=session,
    )

    # A real id moves the card.
    moved = update_flashcard(
        card["id"], FlashcardUpdate(deck_id=second["id"]), user=user, session=session
    )
    assert moved["deckId"] == second["id"]
    assert moved["deckName"] == "Second"

    # None means "field omitted" — the deck is left alone.
    untouched = update_flashcard(
        card["id"], FlashcardUpdate(tag="Graphs"), user=user, session=session
    )
    assert untouched["deckId"] == second["id"]

    # "" clears it back to unassigned.
    cleared = update_flashcard(
        card["id"], FlashcardUpdate(deck_id=""), user=user, session=session
    )
    assert cleared["deckId"] is None
    assert cleared["deckName"] is None


# --- the unassigned bucket is a real filter value, not a client-side fiction ---


def test_unassigned_deck_id_filters_cards_without_a_deck(session, user):
    deck = create_deck(DeckCreate(name="Trees"), user=user, session=session)
    in_deck = create_flashcard(
        FlashcardCreate(front="Q1", back="A1", deck_id=deck["id"]),
        user=user,
        session=session,
    )
    loose = create_flashcard(
        FlashcardCreate(front="Q2", back="A2"), user=user, session=session
    )

    unassigned = list_flashcards(deck_id=UNASSIGNED_DECK_ID, user=user, session=session)

    assert [c["id"] for c in unassigned] == [loose["id"]]
    assert [c["id"] for c in list_flashcards(deck_id=deck["id"], user=user, session=session)] == [
        in_deck["id"]
    ]


def test_unassigned_sentinel_is_accepted_as_no_deck_on_writes(session, user):
    created = create_flashcard(
        FlashcardCreate(front="Q", back="A", deck_id=UNASSIGNED_DECK_ID),
        user=user,
        session=session,
    )
    assert created["deckId"] is None

    deck = create_deck(DeckCreate(name="Somewhere"), user=user, session=session)
    update_flashcard(
        created["id"], FlashcardUpdate(deck_id=deck["id"]), user=user, session=session
    )
    back_out = update_flashcard(
        created["id"],
        FlashcardUpdate(deck_id=UNASSIGNED_DECK_ID),
        user=user,
        session=session,
    )
    assert back_out["deckId"] is None


# --- text validation ---


def test_blank_flashcard_text_is_rejected(session, user):
    with pytest.raises(ValidationError):
        FlashcardCreate(front="   ", back="A")
    with pytest.raises(ValidationError):
        FlashcardCreate(front="Q", back="")
    with pytest.raises(ValidationError):
        FlashcardUpdate(front=" \n ")


def test_flashcard_text_is_stripped(session, user):
    card = create_flashcard(
        FlashcardCreate(front="  Q  ", back="  A  "), user=user, session=session
    )
    assert card["front"] == "Q"
    assert card["back"] == "A"


def test_deck_update_treats_null_name_as_omitted(session, user):
    deck = create_deck(DeckCreate(name="Keep Me"), user=user, session=session)

    # An explicit null must validate as "leave the name alone", not blow up.
    updated = update_deck(
        deck["id"],
        DeckUpdate(name=None, description="Now described"),
        user=user,
        session=session,
    )

    assert updated["name"] == "Keep Me"
    assert updated["description"] == "Now described"


def test_deck_blank_description_and_color_normalize_to_none(session, user):
    created = create_deck(
        DeckCreate(name="Sparse", description="   ", color=""),
        user=user,
        session=session,
    )
    assert created["description"] is None
    assert created["color"] is None

    cleared = update_deck(
        created["id"],
        DeckUpdate(description=" \t ", color="  "),
        user=user,
        session=session,
    )
    assert cleared["description"] is None
    assert cleared["color"] is None
