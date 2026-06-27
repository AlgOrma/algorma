import React, { useState, useMemo } from 'react';
import Badge from '../components/common/Badge';
import CodeBlock from '../components/common/CodeBlock';
import Button from '../components/common/Button';
import { GRADES } from '../data/initialData';

export default function RevisionSession({
  problems = [],
  onUpdateProblem,
  onNavigate
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  // Fetch only due problems for the revision session
  const dueList = useMemo(() => {
    return problems.filter(p => p.due);
  }, [problems]);

  const totalCards = dueList.length;
  const isFinished = currentIndex >= totalCards;
  const currentCard = isFinished ? null : dueList[currentIndex];

  // Handle rescheduling the card based on spacing grade
  const handleGrade = (gradeItem) => {
    if (!currentCard) return;

    // Reschedule utilizing mock SM-2 intervals
    const nextReviewLabel = gradeItem.iv; // E.g., '12 days' or '2 days' or '<10 min'
    const isStillDue = gradeItem.key === 'Again'; // 'Again' keeps card due

    const updated = {
      ...currentCard,
      due: isStillDue,
      lastRevised: 'just now',
      nextLabel: isStillDue ? 'today' : `in ${nextReviewLabel}`,
      revisions: (currentCard.revisions || 0) + 1
    };

    onUpdateProblem(updated);
    
    // Proceed to next card
    setRevealed(false);
    setCurrentIndex(prev => prev + 1);
  };

  const progressPercentage = totalCards ? Math.round((currentIndex / totalCards) * 100) : 0;

  // Active Deck View
  if (!isFinished && currentCard) {
    return (
      <div className="w-full h-full overflow-y-auto custom-scrollbar text-left">
        <div className="max-w-[760px] mx-auto px-9 pt-sp-28 pb-11 flex flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-fs-11 text-accent tracking-[0.06em]">
            REVISION · SPOILER-FREE
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

        {/* Title */}
        <div className="flex items-center gap-3 mt-sp-22">
          <span className="text-fs-24 font-bold text-text-main tracking-[-0.015em]">
            {currentCard.title}
          </span>
          <Badge type="difficulty" value={currentCard.difficulty} />
        </div>

        {/* Metadata */}
        <div className="font-mono text-fs-11-5 text-text-muted mt-2">
          {currentCard.topic} · last revised {currentCard.lastRevised} · created {currentCard.created}
        </div>

        {/* Problem Statement box */}
        <div 
          className="mt-5 text-fs-14-5 leading-[1.75] text-text-code"
          dangerouslySetInnerHTML={{ __html: currentCard.statement }}
        />
        
        {currentCard.exIn && (
          <div className="font-mono text-fs-12-5 text-text-muted mt-3 leading-[1.7] bg-bg-code border border-border-muted rounded-lg py-sp-11 px-sp-13">
            in:  {currentCard.exIn}<br />
            out: {currentCard.exOut}
          </div>
        )}

        {/* Memory Scratchpad */}
        <div className="mt-sp-18 bg-bg-panel-dark border border-dashed border-border-btn rounded-card-sm py-sp-16 px-sp-18 min-h-[74px]">
          <span className="font-mono text-fs-12-5 text-border-accent">
            // solve from memory — your saved code stays hidden<span style={{ animation: 'blink 1s step-end infinite', opacity: 0.6 }}>▋</span>
          </span>
          <style>{`
            @keyframes blink {
              from, to { color: transparent }
              50% { color: var(--color-border-accent) }
            }
          `}</style>
        </div>

        {/* Spoiler Solution Block */}
        <CodeBlock 
          code={currentCard.solution}
          isSpoiler={true}
          revealed={revealed}
          onToggleReveal={() => setRevealed(!revealed)}
          title="YOUR SOLUTION"
          className="mt-4"
        />

        {/* Rescheduling rating panel */}
        <div className="mt-sp-22">
          <div className="text-fs-13 text-text-muted mb-2.5">
            How did it go?
          </div>
          <div className="flex gap-2.5">
            {GRADES.map((g) => (
              <button
                key={g.key}
                onClick={() => handleGrade(g)}
                className="flex-1 flex flex-col items-center gap-sp-5 py-sp-13 px-sp-8 rounded-card-sm bg-bg-card border border-border-btn cursor-pointer hover:border-border-btn-hover hover:bg-bg-element-hover transition-colors duration-200"
              >
                <span 
                  className="text-fs-13-5 font-semibold"
                  style={{ color: g.c }}
                >
                  {g.key}
                </span>
                <span className="font-mono text-fs-10-5 text-text-muted">
                  {g.iv}
                </span>
              </button>
            ))}
          </div>
          <div className="font-mono text-fs-10-5 text-border-accent mt-sp-9">
            ↑ your grade schedules the next review · SM-2 spaced repetition
          </div>
        </div>
      </div>
      </div>
    );
  }

  // Completion View
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="max-w-[760px] mx-auto px-9 pt-sp-28 pb-11 flex flex-col items-center">
      <div className="flex flex-col items-center text-center py-16 px-5">
        <div className="w-16 h-16 rounded-full bg-accent-green-hover/12 border border-accent-green-hover/32 flex items-center justify-center mb-5">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-green-hover)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7"/>
          </svg>
        </div>
        
        <div className="text-fs-22 font-bold text-text-main tracking-[-0.015em]">
          Revision session complete
        </div>
        <div className="text-fs-14 text-text-mid mt-2 max-w-[380px] leading-[1.6]">
          {totalCards > 0 
            ? `You reviewed ${totalCards} problems. Each one was rescheduled by how you graded it — the next batch is already on your calendar.`
            : "No revision tasks due right now. Nice job staying on top of your schedule!"
          }
        </div>
        
        <div className="flex gap-2.5 mt-6">
          <Button 
            variant="secondary"
            onClick={() => {
              setCurrentIndex(0);
              setRevealed(false);
            }}
            disabled={problems.filter(p => p.due).length === 0}
          >
            Revise again
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
