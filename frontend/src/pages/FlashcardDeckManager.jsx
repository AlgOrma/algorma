import React, { useState, useEffect, useCallback } from 'react';
import Button from '../components/common/Button';
import ConfirmationModal from '../components/common/ConfirmationModal';
import * as api from '../api';
import { UNASSIGNED_DECK } from '../data/initialData';

const DECK_COLORS = [
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Rose', hex: '#ef4444' },
  { name: 'Cyan', hex: '#06b6d4' },
];

const UNASSIGNED_PSEUDO_DECK = {
  id: UNASSIGNED_DECK,
  name: 'General / Unassigned',
  color: '#6b7280',
  description: 'Flashcards not assigned to any deck.',
};

export default function FlashcardDeckManager({ onNavigate, onStartStudy, onCardsChanged }) {
  const [decks, setDecks] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Active filter state
  const [selectedDeckId, setSelectedDeckId] = useState(null); // null = all decks view
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showDeckModal, setShowDeckModal] = useState(false);
  const [editingDeck, setEditingDeck] = useState(null); // null = create mode
  const [deckForm, setDeckForm] = useState({ name: '', description: '', color: '#3b82f6' });
  const [deckError, setDeckError] = useState(null);

  const [deletingItem, setDeletingItem] = useState(null); // { type: 'deck'|'card', id, name }

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [fetchedDecks, fetchedCards] = await Promise.all([
        api.getDecks(),
        api.getFlashcards(),
      ]);
      setDecks(fetchedDecks || []);
      setCards(fetchedCards || []);
      if (onCardsChanged) onCardsChanged();
    } catch (err) {
      console.error('Failed to load flashcard decks:', err);
      setError('Could not connect to server or load flashcards.');
    } finally {
      setLoading(false);
    }
  }, [onCardsChanged]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Total statistics
  const totalCardsCount = cards.length;
  const totalDueCount = cards.filter((c) => c.due).length;
  const unassignedCards = cards.filter((c) => !c.deckId);

  // Deck CRUD Handlers
  const openCreateDeckModal = () => {
    setEditingDeck(null);
    setDeckForm({ name: '', description: '', color: '#3b82f6' });
    setDeckError(null);
    setShowDeckModal(true);
  };

  const openEditDeckModal = (deck, e) => {
    e.stopPropagation();
    setEditingDeck(deck);
    setDeckForm({
      name: deck.name,
      description: deck.description || '',
      color: deck.color || '#3b82f6',
    });
    setDeckError(null);
    setShowDeckModal(true);
  };

  const handleSaveDeck = async (e) => {
    e.preventDefault();
    if (!deckForm.name.trim()) {
      setDeckError('Deck name cannot be blank.');
      return;
    }

    try {
      setDeckError(null);
      if (editingDeck) {
        await api.updateDeck(editingDeck.id, deckForm);
      } else {
        await api.createDeck(deckForm);
      }
      setShowDeckModal(false);
      await loadData();
    } catch (err) {
      setDeckError(err.message || 'Failed to save deck');
    }
  };

  const handleDeleteDeck = async (deckId) => {
    try {
      await api.deleteDeck(deckId);
      if (selectedDeckId === deckId) setSelectedDeckId(null);
      setDeletingItem(null);
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete deck');
    }
  };

  // Card CRUD Handlers
  const openCreateCardModal = (presetDeckId = null) => {
    // The unassigned pseudo-deck maps to an explicit "no deck" preset.
    if (presetDeckId === UNASSIGNED_DECK) presetDeckId = '';
    onNavigate('flashcards-editor', { presetDeckId });
  };

  const openEditCardModal = (card) => {
    onNavigate('flashcards-editor', { cardId: card.id });
  };

  const handleDeleteCard = async (cardId) => {
    try {
      await api.deleteFlashcard(cardId);
      setDeletingItem(null);
      await loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete card');
    }
  };

  const selectDeck = (deckId) => {
    setSelectedDeckId(deckId);
    setSearchQuery('');
  };

  // Filtered Cards for browser view
  const filteredCards = cards.filter((card) => {
    if (selectedDeckId === UNASSIGNED_DECK) {
      if (card.deckId) return false;
    } else if (selectedDeckId && card.deckId !== selectedDeckId) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchFront = card.front.toLowerCase().includes(q);
      const matchBack = card.back.toLowerCase().includes(q);
      const matchTag = card.tag.toLowerCase().includes(q);
      return matchFront || matchBack || matchTag;
    }
    return true;
  });

  // Cards belonging to the currently selected deck (before search filtering),
  // used to decide whether the "Study" button should be enabled.
  const selectedDeckCards = cards.filter((card) =>
    selectedDeckId === UNASSIGNED_DECK
      ? !card.deckId
      : card.deckId === selectedDeckId
  );

  const selectedDeck =
    selectedDeckId === UNASSIGNED_DECK
      ? { ...UNASSIGNED_PSEUDO_DECK, dueCount: selectedDeckCards.filter((c) => c.due).length }
      : decks.find((d) => d.id === selectedDeckId);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-fs-14 font-mono text-text-muted animate-pulse">
          Loading flashcard decks...
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar text-left p-6 lg:p-9">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-fs-24 font-bold text-text-main tracking-tight">
              Flashcard Decks
            </h1>
            <span className="font-mono text-fs-11 px-2.5 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent font-medium">
              ANKI · FSRS SRS
            </span>
          </div>
          <p className="text-fs-13 text-text-muted mt-1">
            Organize algorithms, data structures, and core concepts into custom decks with spaced repetition.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {totalDueCount > 0 && (
            <Button
              onClick={() => onStartStudy && onStartStudy({})}
              variant="primary"
            >
              <span className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                Study All Due ({totalDueCount})
              </span>
            </Button>
          )}
          <Button onClick={openCreateDeckModal} variant="secondary">
            + New Deck
          </Button>
          <Button onClick={() => openCreateCardModal(selectedDeckId)} variant="secondary">
            + Add Card
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-fs-13">
          {error}
        </div>
      )}

      {/* Main Layout: Deck Grid + Card Browser */}
      {selectedDeckId === null ? (
        /* Decks Grid View */
        <div>
          {decks.length === 0 && unassignedCards.length === 0 ? (
            <div className="mt-8 p-12 border border-dashed border-border-btn rounded-2xl flex flex-col items-center justify-center text-center bg-bg-card-grad-start">
              <div className="w-14 h-14 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-blue)" strokeWidth="2">
                  <rect x="2" y="6" width="20" height="12" rx="2" />
                  <path d="M6 12h12" />
                </svg>
              </div>
              <h3 className="text-fs-18 font-bold text-text-main mb-1">No decks yet</h3>
              <p className="text-fs-13 text-text-muted max-w-sm mb-5">
                Create your first deck to start organizing flashcards by topic, pattern, or difficulty.
              </p>
              <Button onClick={openCreateDeckModal}>Create Your First Deck</Button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-fs-12 text-text-muted uppercase tracking-wider">
                  Your Decks ({decks.length})
                </span>
                <span className="font-mono text-fs-12 text-text-muted">
                  Total Cards: {totalCardsCount} · Overdue: {totalDueCount}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {decks.map((deck) => {
                  const deckCards = cards.filter((c) => c.deckId === deck.id);
                  const deckCardCount = deckCards.length;
                  const deckDueCount = deckCards.filter((c) => c.due).length;

                  return (
                    <div
                      key={deck.id}
                      onClick={() => selectDeck(deck.id)}
                      className="group bg-gradient-to-br from-bg-card-grad-start to-bg-card-grad-end border border-border-btn hover:border-accent/40 rounded-2xl p-6 shadow-card hover:shadow-card-hover transition-all cursor-pointer flex flex-col justify-between"
                      style={{ borderLeftColor: deck.color || 'var(--color-accent-blue)', borderLeftWidth: '4px' }}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-fs-16 font-bold text-text-main group-hover:text-accent transition-colors line-clamp-1">
                            {deck.name}
                          </h3>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => openEditDeckModal(deck, e)}
                              title="Edit deck"
                              className="p-1.5 text-text-muted hover:text-text-main transition-colors"
                            >
                              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12.5 4.5l3 3" />
                                <path d="M4 16.5l-.7.2.2-.7L13 6.5l.5-.5 3 3-.5.5-8.5 8.5z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingItem({ type: 'deck', id: deck.id, name: deck.name });
                              }}
                              title="Delete deck"
                              className="p-1.5 text-text-muted hover:text-red-400 transition-colors"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        <p className="text-fs-12 text-text-muted line-clamp-2 min-h-[36px] mb-4">
                          {deck.description || 'No description provided.'}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-border-btn/50 mt-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-fs-11 px-2 py-0.5 rounded bg-bg-track text-text-muted">
                            {deckCardCount} cards
                          </span>
                          {deckDueCount > 0 ? (
                            <span className="font-mono text-fs-11 px-2 py-0.5 rounded bg-accent/15 text-accent font-semibold">
                              {deckDueCount} due
                            </span>
                          ) : (
                            <span className="font-mono text-fs-11 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                              Caught up
                            </span>
                          )}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onStartStudy) onStartStudy({ deckId: deck.id });
                          }}
                          disabled={deckCardCount === 0}
                          className="font-mono text-fs-11 text-accent font-semibold hover:underline disabled:opacity-40 disabled:no-underline"
                        >
                          Study →
                        </button>
                      </div>
                    </div>
                  );
                })}

                {unassignedCards.length > 0 && (
                  <div
                    key={UNASSIGNED_DECK}
                    onClick={() => selectDeck(UNASSIGNED_DECK)}
                    className="group bg-gradient-to-br from-bg-card-grad-start to-bg-card-grad-end border border-border-btn hover:border-accent/40 rounded-2xl p-6 shadow-card hover:shadow-card-hover transition-all cursor-pointer flex flex-col justify-between"
                    style={{ borderLeftColor: UNASSIGNED_PSEUDO_DECK.color, borderLeftWidth: '4px', borderStyle: 'dashed' }}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="text-fs-16 font-bold text-text-main group-hover:text-accent transition-colors line-clamp-1">
                          {UNASSIGNED_PSEUDO_DECK.name}
                        </h3>
                      </div>
                      <p className="text-fs-12 text-text-muted line-clamp-2 min-h-[36px] mb-4">
                        {UNASSIGNED_PSEUDO_DECK.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-border-btn/50 mt-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-fs-11 px-2 py-0.5 rounded bg-bg-track text-text-muted">
                          {unassignedCards.length} cards
                        </span>
                        <span className="font-mono text-fs-11 px-2 py-0.5 rounded bg-accent/15 text-accent font-semibold">
                          {unassignedCards.filter((c) => c.due).length} due
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onStartStudy) onStartStudy({ deckId: UNASSIGNED_DECK });
                        }}
                        disabled={unassignedCards.length === 0}
                        className="font-mono text-fs-11 text-accent font-semibold hover:underline disabled:opacity-40 disabled:no-underline"
                      >
                        Study →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Single Deck Detail / Card Browser View */
        <div>
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => selectDeck(null)}
              className="font-mono text-fs-12 text-text-muted hover:text-text-main transition-colors flex items-center gap-1.5"
            >
              ← Back to all decks
            </button>

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                onClick={() => onStartStudy && onStartStudy({ deckId: selectedDeckId })}
                disabled={selectedDeckCards.length === 0}
              >
                <span className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  Study Deck
                </span>
              </Button>
              <Button variant="secondary" onClick={() => openCreateCardModal(selectedDeckId)}>
                + Add Card to {selectedDeck?.name}
              </Button>
            </div>
          </div>

          <div className="bg-gradient-to-br from-bg-card-grad-start to-bg-card-grad-end border border-border-btn rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <span
                  className="font-mono text-fs-10 px-2 py-0.5 rounded text-white font-semibold uppercase tracking-wider inline-block mb-2"
                  style={{ backgroundColor: selectedDeck?.color || '#3b82f6' }}
                >
                  DECK
                </span>
                <h2 className="text-fs-20 font-bold text-text-main">{selectedDeck?.name}</h2>
                {selectedDeck?.description && (
                  <p className="text-fs-13 text-text-muted mt-1">{selectedDeck.description}</p>
                )}
              </div>
              <div className="text-right">
                <div className="font-mono text-fs-22 font-bold text-accent">
                  {selectedDeck?.dueCount || 0}
                </div>
                <div className="font-mono text-fs-10 text-text-muted uppercase">Due for review</div>
              </div>
            </div>
          </div>

          {/* Search bar inside deck */}
          <div className="mb-5">
            <input
              type="text"
              placeholder="Search cards in this deck..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full max-w-md px-4 py-2 bg-bg-track border border-border-btn rounded-xl text-fs-13 text-text-main focus:outline-none focus:border-accent"
            />
          </div>

          {/* Cards List */}
          {filteredCards.length === 0 ? (
            <div className="p-8 border border-dashed border-border-btn rounded-xl text-center text-text-muted">
              No flashcards found in this deck. Click "+ Add Card to {selectedDeck?.name}" to create one!
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCards.map((card) => (
                <div
                  key={card.id}
                  className="bg-gradient-to-br from-bg-card-grad-start to-bg-card-grad-end border border-border-btn rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-border-btn/80 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-mono text-fs-10 text-accent uppercase px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20">
                        {card.tag || 'General'}
                      </span>
                      {card.due && (
                        <span className="font-mono text-fs-10 text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                          DUE NOW
                        </span>
                      )}
                    </div>

                    <div className="font-semibold text-text-main text-fs-14 mb-1">
                      {card.front}
                    </div>
                    <div className="text-fs-12 text-text-muted line-clamp-2 font-mono bg-bg-track/50 p-2 rounded">
                      {card.back}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-center">
                    <button
                      onClick={() => openEditCardModal(card)}
                      className="px-2.5 py-1 text-fs-11 font-mono rounded bg-bg-track text-text-muted hover:text-text-main transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingItem({ type: 'card', id: card.id, name: card.front })}
                      className="px-2.5 py-1 text-fs-11 font-mono rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- MODALS --- */}

      {/* Deck Modal */}
      {showDeckModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-bg-card-grad-start border border-border-btn rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-fs-18 font-bold text-text-main">
                {editingDeck ? 'Edit Deck' : 'Create New Deck'}
              </h3>
              <button
                onClick={() => setShowDeckModal(false)}
                className="text-text-muted hover:text-text-main"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDeck} className="space-y-4">
              <div>
                <label className="block text-fs-12 font-mono text-text-muted mb-1">Deck Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dynamic Programming Patterns"
                  value={deckForm.name}
                  onChange={(e) => setDeckForm({ ...deckForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 bg-bg-track border border-border-btn rounded-xl text-fs-13 text-text-main focus:outline-none focus:border-accent"
                />
                {deckError && (
                  <p className="mt-1.5 text-fs-11 text-red-400 font-mono">{deckError}</p>
                )}
              </div>

              <div>
                <label className="block text-fs-12 font-mono text-text-muted mb-1">Description</label>
                <textarea
                  rows="3"
                  placeholder="Brief notes on what this deck covers..."
                  value={deckForm.description}
                  onChange={(e) => setDeckForm({ ...deckForm, description: e.target.value })}
                  className="w-full px-3.5 py-2 bg-bg-track border border-border-btn rounded-xl text-fs-13 text-text-main focus:outline-none focus:border-accent resize-none"
                />
              </div>

              <div>
                <label className="block text-fs-12 font-mono text-text-muted mb-1.5">Theme Color</label>
                <div className="flex items-center gap-2">
                  {DECK_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setDeckForm({ ...deckForm, color: c.hex })}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        deckForm.color === c.hex ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-bg-card-grad-start' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4">
                <Button variant="secondary" onClick={() => setShowDeckModal(false)} type="button">
                  Cancel
                </Button>
                <Button type="submit">{editingDeck ? 'Save Changes' : 'Create Deck'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!deletingItem}
        title={deletingItem?.type === 'deck' ? 'Delete Deck' : 'Delete Card'}
        message={
          deletingItem ? (
            <>
              Are you sure you want to delete{' '}
              {deletingItem.type === 'deck' ? 'deck' : 'card'}{' '}
              <span className="font-semibold text-text-main">"{deletingItem.name}"</span>?
              {deletingItem.type === 'deck' ? (
                <>
                  {' '}Flashcards in this deck will be kept as{' '}
                  <span className="font-semibold text-text-main">"General / Unassigned"</span>,
                  and your review history will be preserved.
                </>
              ) : (
                <> Your review history for this card will be preserved.</>
              )}
            </>
          ) : null
        }
        confirmLabel="Delete Permanently"
        confirmVariant="red"
        onConfirm={() =>
          deletingItem?.type === 'deck'
            ? handleDeleteDeck(deletingItem.id)
            : handleDeleteCard(deletingItem.id)
        }
        onCancel={() => setDeletingItem(null)}
      />
    </div>
  );
}
