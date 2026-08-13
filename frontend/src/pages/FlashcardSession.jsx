import React, { useState, useEffect, useCallback, useRef } from 'react';
import Button from '../components/common/Button';
import FormattedText from '../components/common/FormattedText';
import * as api from '../api';
import { GRADES, gradeIntervalLabel } from '../data/initialData';

const EMPTY_REVIEW_STATS = {
  reviewedCount: 0,
  againCount: 0,
  hardCount: 0,
  goodCount: 0,
  easyCount: 0,
};

export default function FlashcardSession({ deckId, onNavigate, onCardsChanged }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  // Two very different failures. A load error means there is no session to show,
  // so it takes over the screen. A grade error happens mid-session: the card
  // stays put and the message goes inline, under the grade buttons.
  const [loadError, setLoadError] = useState(null);
  const [gradeError, setGradeError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [isGrading, setIsGrading] = useState(false);
  const isGradingRef = useRef(false);
  const [allCaughtUp, setAllCaughtUp] = useState(false);
  const [reviewStats, setReviewStats] = useState(EMPTY_REVIEW_STATS);

  const loadCards = useCallback(
    async (opts = {}) => {
      try {
        setLoading(true);
        setLoadError(null);
        setGradeError(null);
        // Every load returns a different array, so the walk through it starts
        // over. Without this, a reload mid-session keeps the old index and
        // silently skips the cards now sitting in front of it.
        setCurrentIndex(0);
        setFlipped(false);
        setReviewStats(EMPTY_REVIEW_STATS);

        // deckId may be the unassigned sentinel — the API filters on it
        // directly, so there is nothing to translate here.
        const params = { due: true, intervals: true };
        if (deckId) params.deck_id = deckId;
        const dueCards = await api.getFlashcards(params);

        if ((!dueCards || dueCards.length === 0) && opts.studyAhead) {
          // Explicit "study ahead" opt-in: pull every card for this filter so
          // the user can review early without silently re-scheduling due cards.
          const allParams = { intervals: true };
          if (deckId) allParams.deck_id = deckId;
          const allCards = await api.getFlashcards(allParams);
          setAllCaughtUp(false);
          setCards(allCards || []);
        } else {
          setAllCaughtUp((dueCards || []).length === 0);
          setCards(dueCards || []);
        }
      } catch (err) {
        console.error('Failed to load cards for study session:', err);
        setLoadError('Could not load flashcards for review.');
      } finally {
        setLoading(false);
      }
    },
    [deckId]
  );

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  const totalCards = cards.length;
  const isFinished = currentIndex >= totalCards;
  const currentCard = isFinished ? null : cards[currentIndex];

  const handleGrade = useCallback(
    async (gradeObj) => {
      if (!currentCard || isGradingRef.current) return;

      isGradingRef.current = true;
      setIsGrading(true);
      setGradeError(null);
      try {
        await api.reviewFlashcard(currentCard.id, gradeObj.key);
        setReviewStats((prev) => ({
          ...prev,
          reviewedCount: prev.reviewedCount + 1,
          againCount: gradeObj.key === 'Again' ? prev.againCount + 1 : prev.againCount,
          hardCount: gradeObj.key === 'Hard' ? prev.hardCount + 1 : prev.hardCount,
          goodCount: gradeObj.key === 'Good' ? prev.goodCount + 1 : prev.goodCount,
          easyCount: gradeObj.key === 'Easy' ? prev.easyCount + 1 : prev.easyCount,
        }));
        setFlipped(false);
        setCurrentIndex((prev) => prev + 1);
        if (onCardsChanged) onCardsChanged();
      } catch (err) {
        // Hold the card: a failed review must not be counted as a success — and
        // must not tear the session down either. The banner renders under the
        // grade buttons so the user can just try the same card again.
        console.error('Failed to record review grade:', err);
        setGradeError(
          err.message || 'Could not save your review. The card was not advanced — try again.'
        );
      } finally {
        isGradingRef.current = false;
        setIsGrading(false);
      }
    },
    [currentCard, onCardsChanged]
  );

  // Keyboard Shortcuts Listener
  const handleKeyDown = useCallback(
    (e) => {
      if (isFinished || !currentCard || isGradingRef.current) return;

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

  if (loadError || cards.length === 0) {
    // Load failure: surface it rather than pretending the session is empty.
    if (loadError) {
      return (
        <div className="w-full h-full flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center bg-bg-card-grad-start border border-red-500/20 rounded-2xl p-8 shadow-card">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4 text-red-400">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 className="text-fs-18 font-bold text-text-main mb-2">Session Unavailable</h3>
            <p className="text-fs-13 text-text-muted mb-6">{loadError}</p>
            <div className="flex justify-center gap-3">
              <Button variant="secondary" onClick={() => loadCards()}>Retry</Button>
              <Button onClick={() => onNavigate('flashcards')}>Back to Decks</Button>
            </div>
          </div>
        </div>
      );
    }

    // Nothing is due. Show the caught-up state with an explicit opt-in to study
    // ahead, instead of silently re-scheduling cards that aren't due.
    if (allCaughtUp) {
      return (
        <div className="w-full h-full flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center bg-bg-card-grad-start border border-border-btn rounded-2xl p-8 shadow-card">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4 text-emerald-400">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="text-fs-18 font-bold text-text-main mb-2">You're all caught up!</h3>
            <p className="text-fs-13 text-text-muted mb-6">
              No cards are due for review right now. Studying ahead will re-schedule
              cards that aren't due yet.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Button variant="secondary" onClick={() => loadCards({ studyAhead: true })}>
                Study Ahead Anyway
              </Button>
              <Button onClick={() => onNavigate('flashcards')}>Back to Decks</Button>
            </div>
          </div>
        </div>
      );
    }

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
            There are no flashcards here yet. Add some cards to begin practicing!
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

                  {gradeError && (
                    <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-fs-12 font-mono text-center">
                      {gradeError}
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {GRADES.map((g, idx) => {
                      const intervalHint = gradeIntervalLabel(currentCard, g);
                      return (
                        <button
                          key={g.key}
                          onClick={() => handleGrade(g)}
                          disabled={isGrading}
                          className="btn-card-3d flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-xl bg-bg-track hover:bg-border-btn/50 border border-border-btn/80 transition-all select-none disabled:opacity-50 disabled:cursor-not-allowed"
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

  const recalledWellCount = reviewStats.goodCount + reviewStats.easyCount;
  const needsPracticeCount = reviewStats.againCount + reviewStats.hardCount;

  // Completion Summary View
  return (
    <div className="w-full h-full flex items-center justify-center p-6 text-left">
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
            <div className="font-mono text-fs-18 font-bold text-emerald-400">{recalledWellCount}</div>
            <div className="font-mono text-fs-10 text-text-muted uppercase">Recalled Well</div>
            <div className="font-mono text-fs-10 text-text-muted/70 mt-1">
              Good: {reviewStats.goodCount} · Easy: {reviewStats.easyCount}
            </div>
          </div>
          <div>
            <div className="font-mono text-fs-18 font-bold text-amber-400">{needsPracticeCount}</div>
            <div className="font-mono text-fs-10 text-text-muted uppercase">Needs Practice</div>
            <div className="font-mono text-fs-10 text-text-muted/70 mt-1">
              Again: {reviewStats.againCount} · Hard: {reviewStats.hardCount}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => loadCards()}
          >
            Review Again
          </Button>
          <Button onClick={() => onNavigate('flashcards')}>Back to Decks</Button>
        </div>
      </div>
    </div>
  );
}
