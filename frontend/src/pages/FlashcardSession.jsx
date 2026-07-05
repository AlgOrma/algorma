import React, { useState } from 'react';
import Button from '../components/common/Button';
import { GRADES, gradeIntervalLabel } from '../data/initialData';

export default function FlashcardSession({
  cards = [],
  onNavigate
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const totalCards = cards.length;
  const isFinished = currentIndex >= totalCards;
  const currentCard = isFinished ? null : cards[currentIndex];

  // The grade isn't persisted yet — it'll go to POST /flashcards/{id}/review
  // once the feature-flagged flashcards UI is wired to the API.
  const handleGrade = (_grade) => {
    // Proceed to next card
    setFlipped(false);
    setCurrentIndex(prev => prev + 1);
  };

  const progressPercentage = totalCards ? Math.round((currentIndex / totalCards) * 100) : 0;

  // Active Card View
  if (!isFinished && currentCard) {
    return (
      <div className="w-full h-full overflow-y-auto custom-scrollbar text-left">
        <div className="max-w-[680px] mx-auto px-9 pt-sp-28 pb-11 flex flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-fs-11 text-accent tracking-[0.06em]">
            FLASHCARDS · SRS
          </span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-fs-11-5 text-text-muted">
              {currentIndex + 1} / {totalCards}
            </span>
            <span 
              onClick={() => onNavigate('dashboard')} 
              className="font-mono text-fs-11-5 text-text-muted cursor-pointer hover:text-text-hover transition-colors duration-200"
            >
              End session ✕
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-1 bg-bg-track rounded-progress overflow-hidden mt-3">
          <div 
            className="h-full bg-accent rounded-progress transition-all duration-300"
            style={{ 
              width: `${progressPercentage}%`
            }} 
          />
        </div>

        {/* Flashcard Card Box */}
        <div className="mt-5 bg-gradient-to-br from-bg-card-grad-start to-bg-card-grad-end border border-border-btn rounded-2xl pt-sp-26 pb-sp-22 px-sp-26 min-h-[300px] flex flex-col shadow-card">
          {/* Card internal header */}
          <div className="flex items-center justify-between">
            <span className="font-mono text-fs-10-5 text-accent tracking-[0.06em] uppercase">
              {currentCard.type} · {currentCard.tag}
            </span>
            <span className="font-mono text-fs-10 text-border-accent tracking-[0.05em]">
              FLASHCARD
            </span>
          </div>

          {/* Front Side */}
          {!flipped ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center py-4.5 px-0">
              <div className="text-fs-21 font-semibold text-text-main max-w-[480px] leading-1.4 tracking-[-0.01em]">
                {currentCard.front}
              </div>
              <Button onClick={() => setFlipped(true)}>
                Show answer ↵
              </Button>
            </div>
          ) : (
            /* Back Side (Flipped) */
            <div className="flex-1 flex flex-col justify-center gap-sp-18 py-3.5 px-0">
              <div className="text-fs-15 leading-[1.65] text-text-light text-center max-w-[540px] mx-auto">
                {currentCard.back}
              </div>
              
              <div>
                <div className="text-fs-12 text-text-muted text-center mb-2.5">
                  How well did you recall it?
                </div>
                
                <div className="flex gap-3">
                  {GRADES.map((g) => (
                    <button
                      key={g.key}
                      onClick={() => handleGrade(g)}
                      className="btn-card-3d flex-1 flex flex-col items-center gap-1 py-2.5 px-2 select-none"
                    >
                      <span 
                        className="text-fs-13 font-bold"
                        style={{ color: g.c }}
                      >
                        {g.key}
                      </span>
                      <span className="font-mono text-fs-10 text-text-muted">
                        {gradeIntervalLabel(currentCard, g)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Manual flip shortcut */}
        <div className="flex items-center justify-center mt-3.5">
          <span 
            onClick={() => setFlipped(!flipped)} 
            className="font-mono text-fs-11 text-text-muted cursor-pointer select-none hover:text-text-hover transition-colors duration-200"
          >
            ↺ flip card
          </span>
        </div>
        </div>
      </div>
    );
  }

  // Completion View
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="max-w-[680px] mx-auto px-9 pt-sp-28 pb-11 flex flex-col items-center">
      <div className="flex flex-col items-center text-center py-16 px-5">
        <div className="w-16 h-16 rounded-full bg-accent/12 border border-accent/32 flex items-center justify-center mb-5">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7"/>
          </svg>
        </div>
        
        <div className="text-fs-22 font-bold text-text-main tracking-[-0.015em]">
          All caught up
        </div>
        <div className="text-fs-14 text-text-mid mt-2 max-w-[380px] leading-1.6">
          You graded {totalCards} cards. They're rescheduled by ease — come back when the next ones are due.
        </div>
        
        <div className="flex gap-2.5 mt-6">
          <Button 
            variant="secondary"
            onClick={() => {
              setCurrentIndex(0);
              setFlipped(false);
            }}
          >
            Run again
          </Button>
          <Button onClick={() => onNavigate('dashboard')}>
            Back to dashboard
          </Button>
      </div>
      </div>
    </div>
    </div>
  );
}
