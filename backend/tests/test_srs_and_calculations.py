from datetime import timedelta

from sqlmodel import Session, select

from app.models import Deck, Flashcard, ReviewLog, Revision, User
from app.serialize import serialize_deck, serialize_flashcard
from app.services import decks as deck_service
from app.services import flashcards as flashcard_service
from app.srs import preview_intervals, schedule
from app.utils import utcnow


def test_fsrs_schedule_again_resets_due_immediately():
    now = utcnow()
    res = schedule(stability=None, difficulty=None, last_reviewed_at=None, grade="Again", now=now)
    assert res["interval_days"] == 0
    assert res["due_at"] == now
    assert res["stability"] > 0
    assert res["difficulty"] > 0


def test_fsrs_schedule_good_and_easy_schedule_future_dates():
    now = utcnow()
    res_good = schedule(stability=None, difficulty=None, last_reviewed_at=None, grade="Good", now=now)
    res_easy = schedule(stability=None, difficulty=None, last_reviewed_at=None, grade="Easy", now=now)

    assert res_good["interval_days"] >= 1
    assert res_good["due_at"] > now
    assert res_easy["interval_days"] >= res_good["interval_days"]


def test_preview_intervals_returns_all_grades():
    now = utcnow()
    intervals = preview_intervals(stability=None, difficulty=None, last_reviewed_at=None, now=now)
    assert set(intervals.keys()) == {"Again", "Hard", "Good", "Easy"}
    assert intervals["Again"] == 0
    assert intervals["Good"] >= 1


def test_serialize_flashcard_unreviewed_card_is_due():
    card = Flashcard(id="card-1", user_id="u1", front="Prompt", back="Answer")
    serialized = serialize_flashcard(card)

    assert serialized["due"] is True
    assert serialized["reviewCount"] == 0
    assert serialized["lastReviewedAt"] is None
    assert serialized["dueAt"] is None


def test_serialize_flashcard_reviewed_future_and_past():
    now = utcnow()
    card = Flashcard(id="card-2", user_id="u1", front="Prompt", back="Answer")
    
    # Future card (due in 5 days)
    rev_future = Revision(user_id="u1", flashcard_id=card.id, due_at=now + timedelta(days=5), review_count=1)
    serialized_future = serialize_flashcard(card, rev_future, now=now)
    assert serialized_future["due"] is False

    # Overdue card (due 2 days ago)
    rev_overdue = Revision(user_id="u1", flashcard_id=card.id, due_at=now - timedelta(days=2), review_count=2)
    serialized_overdue = serialize_flashcard(card, rev_overdue, now=now)
    assert serialized_overdue["due"] is True


def test_serialize_deck_due_count_math():
    now = utcnow()
    deck = Deck(id="deck-1", user_id="u1", name="Algorithms")

    # Card 1: New (unreviewed) -> Due
    c1 = Flashcard(id="c1", user_id="u1", deck_id=deck.id, front="Q1", back="A1")
    c1.revision = None

    # Card 2: Overdue -> Due
    c2 = Flashcard(id="c2", user_id="u1", deck_id=deck.id, front="Q2", back="A2")
    c2.revision = Revision(user_id="u1", flashcard_id="c2", due_at=now - timedelta(days=1), review_count=1)

    # Card 3: Future -> Not Due
    c3 = Flashcard(id="c3", user_id="u1", deck_id=deck.id, front="Q3", back="A3")
    c3.revision = Revision(user_id="u1", flashcard_id="c3", due_at=now + timedelta(days=4), review_count=1)

    serialized = serialize_deck(deck, cards=[c1, c2, c3], now=now)
    assert serialized["cardCount"] == 3
    assert serialized["dueCount"] == 2


def test_list_flashcards_deck_id_filter_handling(session: Session):
    user = User(id="user-calc-1", name="Test Calc", password_hash="hash")
    session.add(user)
    session.commit()

    deck = deck_service.create_deck(session, user, type("DeckPayload", (), {"name": "DP", "description": "", "color": ""})())
    
    # 1 card in deck, 1 card without deck
    c_deck = flashcard_service.create_flashcard(session, user, type("CardPayload", (), {"deck_id": deck.id, "type": "concept", "tag": "dp", "front": "Q1", "back": "A1"})())
    _c_nodeck = flashcard_service.create_flashcard(session, user, type("CardPayload", (), {"deck_id": None, "type": "concept", "tag": "general", "front": "Q2", "back": "A2"})())

    # Filter with deck_id=deck.id
    deck_cards = flashcard_service.list_flashcards(session, user, deck_id=deck.id)
    assert [c.id for c in deck_cards] == [c_deck.id]

    # Filter with empty deck_id="" or None (returns all user cards)
    all_cards_empty = flashcard_service.list_flashcards(session, user, deck_id="")
    assert len(all_cards_empty) == 2

    all_cards_none = flashcard_service.list_flashcards(session, user, deck_id=None)
    assert len(all_cards_none) == 2


def test_review_flashcard_updates_srs_state(session: Session):
    user = User(id="user-calc-2", name="Review Calc", password_hash="hash")
    session.add(user)
    session.commit()

    card = flashcard_service.create_flashcard(
        session, user, type("CardPayload", (), {"deck_id": None, "type": "concept", "tag": "arrays", "front": "Q", "back": "A"})()
    )

    card_after, rev, now = flashcard_service.review_flashcard(session, user, card.id, "Good")

    assert rev.review_count == 1
    assert rev.stability is not None
    assert rev.difficulty is not None
    assert rev.due_at is not None
    assert rev.due_at > now

    # Verify ReviewLog entry recorded
    logs = session.exec(select(ReviewLog).where(ReviewLog.flashcard_id == card.id)).all()
    assert len(logs) == 1
    assert logs[0].grade == "Good"
