import React, { useState, useMemo, useEffect } from 'react';
import Badge from '../components/common/Badge';
import CodeBlock from '../components/common/CodeBlock';
import Button from '../components/common/Button';
import { GRADES } from '../data/initialData';
import * as api from '../api';

export default function RevisionSession({
  problems = [],
  onUpdateProblem,
  onNavigate
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealedApproaches, setRevealedApproaches] = useState({});
  const [activeApproachIdx, setActiveApproachIdx] = useState(0);
  const [scratchpadText, setScratchpadText] = useState('');

  // Fetch only due problems for the revision session
  const dueList = useMemo(() => {
    return problems.filter(p => p.due);
  }, [problems]);

  const totalCards = dueList.length;
  const isFinished = currentIndex >= totalCards;
  const currentCard = isFinished ? null : dueList[currentIndex];

  // Reset active approach index, scratchpad, and revealed states when moving to next card
  useEffect(() => {
    setActiveApproachIdx(0);
    setRevealedApproaches({});
    setScratchpadText('');
  }, [currentIndex]);

  // Extract approaches for current card
  const approaches = useMemo(() => {
    if (!currentCard) return [];
    return currentCard.approaches && currentCard.approaches.length > 0
      ? currentCard.approaches
      : [
          {
            id: 'default',
            name: 'Default Approach',
            complexityTime: currentCard.complexityTime || '',
            complexitySpace: currentCard.complexitySpace || '',
            approach: currentCard.approach || '',
            code: currentCard.solution || '// Add your code solution here',
            lang: 'Python'
          }
        ];
  }, [currentCard]);

  const activeApproach = approaches[activeApproachIdx] || approaches[0];
  const activeApproachKey = activeApproach ? (activeApproach.id || activeApproachIdx) : null;
  const isCurrentApproachRevealed = activeApproachKey !== null ? !!revealedApproaches[activeApproachKey] : false;

  const handleRevealCurrent = (val) => {
    setRevealedApproaches(prev => ({
      ...prev,
      [activeApproachKey]: val
    }));
  };

  const hasRevealedAny = Object.values(revealedApproaches).some(v => v === true);

  const handleHideAll = () => {
    setRevealedApproaches({});
  };

  // Support Tab key indentation inside scratchpad textarea
  const handleScratchpadKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const value = e.target.value;
      
      const newText = value.substring(0, start) + '    ' + value.substring(end);
      setScratchpadText(newText);
      
      // Reset cursor position after state sync/render
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 4;
      }, 0);
    }
  };

  // Handle rescheduling the card based on spacing grade via API
  const handleGrade = async (gradeItem) => {
    if (!currentCard) return;

    try {
      const res = await api.reviewProblem(currentCard.id, gradeItem.key);
      onUpdateProblem(res);
    } catch (err) {
      console.error('Failed to review problem:', err.message);
    }
    
    // Proceed to next card
    setCurrentIndex(prev => prev + 1);
  };

  const progressPercentage = totalCards ? Math.round((currentIndex / totalCards) * 100) : 0;

  // Active Deck View
  if (!isFinished && currentCard) {
    return (
      <div className="w-full h-full flex overflow-hidden bg-[#050505]">
        {/* LEFT PANE (Problem Details) */}
        <div className="w-[45%] h-full border-r border-border-main flex flex-col bg-[#080808] min-w-[350px]">
          {/* Header bar */}
          <div className="bg-[#000] border-b border-border-muted px-6 py-4 shrink-0 text-fs-11 font-mono">
            <div className="flex items-center justify-between">
              <span className="font-mono text-fs-11 text-accent tracking-[0.06em]">
                REVISION · SPOILER-FREE
              </span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-fs-11 text-text-muted">
                  {currentIndex + 1} / {totalCards}
                </span>
                <span 
                  onClick={() => onNavigate('dashboard')} 
                  className="font-mono text-fs-11 text-text-muted cursor-pointer hover:text-text-hover transition-colors duration-200"
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
          </div>

          {/* Left Content Scrollable */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar text-left">
            {/* Title */}
            <div className="flex items-center gap-3">
              <span className="text-fs-20 font-bold text-text-main tracking-[-0.015em]">
                {currentCard.title}
              </span>
              <Badge type="difficulty" value={currentCard.difficulty} />
            </div>

            {/* Metadata */}
            <div className="font-mono text-fs-11 text-text-muted mt-2">
              {currentCard.topic} · last revised {currentCard.lastRevised} · created {currentCard.created}
            </div>

            <hr className="border-border-muted my-5" />

            {/* Problem Statement */}
            <div>
              <div className="font-mono text-[10px] text-border-accent tracking-[0.05em] mb-3">
                PROBLEM STATEMENT
              </div>
              <div 
                className="text-fs-13.5 leading-relaxed text-text-code select-text"
                dangerouslySetInnerHTML={{ __html: currentCard.statement }}
              />
            </div>
            
            {/* Examples */}
            {(currentCard.exIn || currentCard.exOut) && (
              <div className="mt-5 bg-bg-code border border-border-muted rounded-lg p-4 font-mono text-fs-12 text-text-code whitespace-pre">
                {currentCard.exIn && (
                  <div>
                    <span className="text-text-muted select-none">Input: </span>
                    {currentCard.exIn}
                  </div>
                )}
                {currentCard.exOut && (
                  <div className="mt-1">
                    <span className="text-text-muted select-none">Output: </span>
                    {currentCard.exOut}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANE (Variations & Code Showcase) */}
        <div className="flex-1 h-full flex flex-col bg-[#050505] min-w-0 overflow-hidden">
          
          {/* Approaches tabs */}
          <div className="bg-[#000] border-b border-border-muted px-4 shrink-0 text-fs-11 font-mono">
            <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar select-none w-full">
              {approaches.map((appr, idx) => {
                const isApprRevealed = !!revealedApproaches[appr.id || idx];
                return (
                  <div
                    key={appr.id || idx}
                    onClick={() => setActiveApproachIdx(idx)}
                    className={`flex items-center gap-2 px-4 py-3 border-r border-border-muted cursor-pointer transition-colors relative ${
                      activeApproachIdx === idx
                        ? 'bg-[#050505] text-text-main border-b-2 border-b-accent font-semibold'
                        : 'hover:bg-bg-element-hover hover:text-text-hover'
                    }`}
                  >
                    <span className="max-w-[150px] truncate">{appr.name}</span>
                    {isApprRevealed && (
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-green-hover shrink-0" title="Revealed" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active variation/approach details or reveal challenge screen */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col gap-5 text-left min-h-0">
            {/* Memory Scratchpad */}
            <div className="flex flex-col gap-2 shrink-0">
              <label className="font-mono text-fs-11 text-text-muted tracking-[0.05em] uppercase">
                // CODE scratchpad — type your solution from memory here
              </label>
              <textarea
                placeholder="def solve(params):&#10;    # Write code here... Use Tab for indentation"
                value={scratchpadText}
                onChange={(e) => setScratchpadText(e.target.value)}
                onKeyDown={handleScratchpadKeyDown}
                rows={12}
                className="bg-[#0c0c0c] border border-border-main font-mono text-fs-13 text-text-code outline-none focus:border-accent p-4 rounded-xl resize-y w-full select-text min-h-[280px]"
              />
            </div>

            {/* Revealed content or reveal challenge banner */}
            {!isCurrentApproachRevealed ? (
              <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-border-main bg-bg-card/30 p-8 rounded-xl min-h-[220px]">
                <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mb-4 text-accent">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <div className="text-fs-14 font-semibold text-text-main mb-1">
                  Ready to check {activeApproach.name}?
                </div>
                <p className="text-fs-12-5 text-text-muted text-center max-w-[320px] mb-5 leading-relaxed">
                  Compare your mental model, complexity analysis, and implementation details for this specific variation.
                </p>
                <Button onClick={() => handleRevealCurrent(true)}>
                  Reveal {activeApproach.name} &amp; Grade
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-5 animate-fadeIn">
                {/* Complexity analysis indicators */}
                <div className="grid grid-cols-2 gap-4 shrink-0">
                  <div className="bg-bg-code border border-border-main rounded-xl p-4 flex flex-col gap-1">
                    <span className="font-mono text-[9px] text-text-muted tracking-[0.05em] uppercase">Time Complexity</span>
                    <span className="font-mono text-fs-14 font-semibold text-accent">
                      {activeApproach?.complexityTime || 'N/A'}
                    </span>
                  </div>
                  <div className="bg-bg-code border border-border-main rounded-xl p-4 flex flex-col gap-1">
                    <span className="font-mono text-[9px] text-text-muted tracking-[0.05em] uppercase">Space Complexity</span>
                    <span className="font-mono text-fs-14 font-semibold text-accent">
                      {activeApproach?.complexitySpace || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Explanation text */}
                {activeApproach?.approach && (
                  <div className="bg-bg-card border border-border-card rounded-xl p-5">
                    <div className="font-mono text-[10px] text-border-accent tracking-[0.05em] mb-2.5 uppercase">
                      APPROACH EXPLANATION
                    </div>
                    <div className="text-fs-13 leading-relaxed text-text-hover whitespace-pre-wrap select-text">
                      {activeApproach.approach}
                    </div>
                  </div>
                )}

                {/* Solution Code */}
                <CodeBlock 
                  code={activeApproach?.code || ''}
                  isSpoiler={false}
                  revealed={true}
                  title={`${activeApproach?.name?.toUpperCase() || 'SOLUTION'} (${activeApproach?.lang || 'Python'})`}
                />
              </div>
            )}
          </div>

          {/* Rating panel / Show Answer action bar */}
          <div className="bg-[#000] border-t border-border-muted px-6 py-4 shrink-0 select-none">
            {!hasRevealedAny ? (
              <div className="flex justify-between items-center">
                <span className="font-mono text-fs-10.5 text-text-muted">
                  Press Reveal to rate your recall
                </span>
                <Button size="sm" onClick={() => handleRevealCurrent(true)}>
                  Reveal Solution
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-fs-12 font-medium text-text-main">
                    How well did you remember this problem?
                  </span>
                  <button 
                    onClick={handleHideAll}
                    className="font-mono text-[10px] text-text-muted hover:text-text-hover bg-transparent border-none cursor-pointer"
                  >
                    Hide solutions ▲
                  </button>
                </div>
                <div className="flex gap-3">
                  {GRADES.map((g) => (
                    <button
                      key={g.key}
                      onClick={() => handleGrade(g)}
                      className="btn-card-3d flex-1 flex flex-col items-center gap-1 py-2 px-2 cursor-pointer select-none"
                    >
                      <span 
                        className="text-fs-13 font-bold"
                        style={{ color: g.c }}
                      >
                        {g.key}
                      </span>
                      <span className="font-mono text-[10px] text-text-muted">
                        {g.iv}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Completion View
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#050505]">
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
                setRevealedApproaches({});
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

