import React, { useState, useEffect, useCallback } from 'react';
import Button from '../components/common/Button';
import FormattedText from '../components/common/FormattedText';
import * as api from '../api';
import { GRADES, gradeIntervalLabel } from '../data/initialData';

export default function FlashcardSession({ deckId, onNavigate }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewStats, setReviewStats] = useState({ reviewedCount: 0, againCount: 0, goodCount: 0 });

  const loadCards = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { due: true };
      if (deckId) params.deck_id = deckId;
      let dueCards = await api.getFlashcards(params);
      
      // If no cards due for this specific filter, load all cards in deck/all so user can review anyway
      if (!dueCards || dueCards.length === 0) {
        const allParams = deckId ? { deck_id: deckId } : {};
        dueCards = await api.getFlashcards(allParams);
      }

      setCards(dueCards || []);
    } catch (err) {
      console.error('Failed to load cards for study session:', err);
      setError('Could not load flashcards for review.');
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const totalCards = cards.length;
  const isFinished = currentIndex >= totalCards;
  const currentCard = isFinished ? null : cards[currentIndex];

  const handleGrade = useCallback(async (gradeObj) => {
    if (!currentCard) return;

    try {
      await api.reviewFlashcard(currentCard.id, gradeObj.key);
      setReviewStats((prev) => ({
        ...prev,
        reviewedCount: prev.reviewedCount + 1,
        againCount: gradeObj.key === 'Again' ? prev.againCount + 1 : prev.againCount,
        goodCount: gradeObj.key === 'Good' || gradeObj.key === 'Easy' ? prev.goodCount + 1 : prev.goodCount,
      }));
    } catch (err) {
      console.error('Failed to record review grade:', err);
    }

    setFlipped(false);
    setCurrentIndex((prev) => prev + 1);
  }, [currentCard]);

  // Keyboard Shortcuts Listener
  const handleKeyDown = useCallback(
    (e) => {
      if (isFinished || !currentCard) return;

      // Ignore shortcut keys if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!flipped) {
          setFlipped(true);
        } else {
          // Default Space/Enter grade is "Good"
          const goodGrade = GRADES.find((g) => g.key === 'Good') || GRADES[2];
          handleGrade(goodGrade);
        }
      } else if (flipped) {
        if (e.key === '1') handleGrade(GRADES.find((g) => g.key === 'Again') || GRADES[0]);
        if (e.key === '2') handleGrade(GRADES.find((g) => g.key === 'Hard') || GRADES[1]);
        if (e.key === '3') handleGrade(GRADES.find((g) => g.key === 'Good') || GRADES[2]);
        if (e.key === '4') handleGrade(GRADES.find((g) => g.key === 'Easy') || GRADES[3]);
      }
    },
    [flipped, isFinished, currentCard, handleGrade]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const progressPercentage = totalCards ? Math.round((currentIndex / totalCards) * 100) : 0;

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-fs-14 font-mono text-text-muted animate-pulse">
          Preparing SRS Study Session...
        </div>
      </div>
    );
  }

  if (error || cards.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-bg-card-grad-start border border-border-btn rounded-2xl p-8 shadow-card">
          <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4 text-accent">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5.5" width="13" height="11" rx="2" />
              <path d="M7 5.5V3.8A1.8 1.8 0 0 1 8.8 2H19.2A1.8 1.8 0 0 1 21 3.8V14.2A1.8 1.8 0 0 1 19.2 16H16" />
            </svg>
          </div>
          <h3 className="text-fs-18 font-bold text-text-main mb-2">No Cards Available</h3>
          <p className="text-fs-13 text-text-muted mb-6">
            There are no flashcards in this deck yet. Add some cards to begin practicing!
          </p>
          <Button onClick={() => onNavigate('flashcards')}>Back to Decks</Button>
        </div>
      </div>
    );
  }

  // Active Card View
  if (!isFinished && currentCard) {
    return (
      <div className="w-full h-full overflow-y-auto custom-scrollbar text-left">
        <div className="max-w-[720px] mx-auto px-6 sm:px-9 pt-6 pb-11 flex flex-col">
          {/* Header Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-fs-11 text-accent tracking-wider font-semibold">
                ANKI · FSRS REVIEW
              </span>
              {currentCard.deckName && (
                <span className="font-mono text-fs-11 text-text-muted px-2 py-0.5 rounded bg-bg-track">
                  {currentCard.deckName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-fs-12 text-text-muted font-medium">
                {currentIndex + 1} / {totalCards}
              </span>
              <button
                onClick={() => onNavigate('flashcards')}
                className="font-mono text-fs-11 text-text-muted hover:text-text-main transition-colors"
              >
                End Session ✕
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-1.5 bg-bg-track rounded-full overflow-hidden mt-3">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          {/* Flashcard Box */}
          <div
            className="mt-6 bg-gradient-to-br from-bg-card-grad-start to-bg-card-grad-end border border-border-btn rounded-2xl p-7 min-h-[340px] flex flex-col shadow-2xl transition-all duration-200"
            style={{
              borderColor: flipped ? 'var(--color-accent-blue)' : 'var(--color-border-btn)',
            }}
          >
            {/* Card Internal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border-btn/40">
              <span className="font-mono text-fs-10 text-accent tracking-wider uppercase font-semibold">
                {currentCard.type || 'CONCEPT'} · {currentCard.tag || 'General'}
              </span>
              <span className="font-mono text-fs-10 text-text-muted">
                {flipped ? 'BACK (ANSWER)' : 'FRONT (PROMPT)'}
              </span>
            </div>

            {/* Front Side */}
            {!flipped ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center py-6">
                <div className="text-fs-18 sm:text-fs-20 font-semibold text-text-main max-w-[580px] leading-relaxed w-full">
                  <FormattedText content={currentCard.front} />
                </div>

                <div className="flex flex-col items-center gap-2 mt-4">
                  <Button onClick={() => setFlipped(true)}>
                    Show Answer <span className="font-mono text-fs-11 opacity-80">(Space / ↵)</span>
                  </Button>
                </div>
              </div>
            ) : (
              /* Back Side (Flipped) */
              <div className="flex-1 flex flex-col justify-between pt-5">
                <div className="flex-1 flex flex-col justify-center">
                  <div className="text-fs-13 leading-relaxed text-text-main bg-bg-track/60 border border-border-btn/60 rounded-xl p-5 overflow-x-auto custom-scrollbar max-h-[320px]">
                    <FormattedText content={currentCard.back} />
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-border-btn/40">
                  <div className="text-fs-12 text-text-muted text-center mb-3 font-mono">
                    How well did you recall it? <span className="opacity-70">(Keys 1-4)</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {GRADES.map((g, idx) => {
                      const intervalHint = gradeIntervalLabel(currentCard, g);
                      return (
                        <button
                          key={g.key}
                          onClick={() => handleGrade(g)}
                          className="btn-card-3d flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-xl bg-bg-track hover:bg-border-btn/50 border border-border-btn/80 transition-all select-none"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-fs-10 opacity-60">[{idx + 1}]</span>
                            <span className="text-fs-13 font-bold" style={{ color: g.c }}>
                              {g.key}
                            </span>
                          </div>
                          <span className="font-mono text-fs-10 text-text-muted">
                            {intervalHint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Manual Flip Shortcut Footer */}
          <div className="flex items-center justify-between mt-4 px-1 text-fs-11 font-mono text-text-muted">
            <span
              onClick={() => setFlipped(!flipped)}
              className="cursor-pointer hover:text-text-main transition-colors select-none"
            >
              ↺ Flip Card (Space)
            </span>
            <span>Shortcuts: [1] Again · [2] Hard · [3] Good · [4] Easy</span>
          </div>
        </div>
      </div>
    );
  }

  // Completion Summary View
  return (
    <div className="w-full h-full flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center bg-bg-card-grad-start border border-border-btn rounded-2xl p-8 shadow-2xl">
        <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5 text-emerald-400">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h2 className="text-fs-22 font-bold text-text-main tracking-tight">Session Complete!</h2>
        <p className="text-fs-13 text-text-muted mt-2 leading-relaxed">
          You evaluated <span className="font-semibold text-text-main">{reviewStats.reviewedCount} cards</span> using FSRS spaced repetition.
        </p>

        <div className="grid grid-cols-2 gap-3 my-6 p-4 rounded-xl bg-bg-track border border-border-btn/60">
          <div>
            <div className="font-mono text-fs-18 font-bold text-emerald-400">{reviewStats.goodCount}</div>
            <div className="font-mono text-fs-10 text-text-muted uppercase">Recalled Well</div>
          </div>
          <div>
            <div className="font-mono text-fs-18 font-bold text-amber-400">{reviewStats.againCount}</div>
            <div className="font-mono text-fs-10 text-text-muted uppercase">Needs Practice</div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setCurrentIndex(0);
              setFlipped(false);
              loadCards();
            }}
          >
            Review Again
          </Button>
          <Button onClick={() => onNavigate('flashcards')}>Back to Decks</Button>
        </div>
      </div>
    </div>
  );
}
