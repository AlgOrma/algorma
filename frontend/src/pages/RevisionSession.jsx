import React, { useState, useMemo, useEffect, useRef } from 'react';
import Badge from '../components/common/Badge';
import CodeBlock from '../components/common/CodeBlock';
import Button from '../components/common/Button';
import { GRADES, gradeIntervalLabel } from '../data/initialData';
import * as api from '../api';

export default function RevisionSession({
  problems = [],
  onUpdateProblem,
  onNavigate,
  customProblems = null
}) {
  const [sessionStarted, setSessionStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealedApproaches, setRevealedApproaches] = useState({});
  const [activeApproachIdx, setActiveApproachIdx] = useState(0);
  const [scratchpadText, setScratchpadText] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const [sessionProblems, setSessionProblems] = useState([]);

  // Past grading events for the card being revised (null = loading)
  const [reviewHistory, setReviewHistory] = useState(null);

  // Shown when saving a grade fails (otherwise the buttons look dead)
  const [gradeError, setGradeError] = useState(null);

  // Keep the queue fresh while on the overview; freeze it once the session starts
  useEffect(() => {
    if (!sessionStarted && currentIndex === 0) {
      setSessionProblems(customProblems || problems.filter(p => p.due));
    }
  }, [problems, customProblems, currentIndex, sessionStarted]);

  const totalCards = sessionProblems.length;
  const isFinished = currentIndex >= totalCards;
  const currentCard = isFinished ? null : sessionProblems[currentIndex];

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

  // Handle rescheduling the card based on spacing grade via API.
  // reviewProblem already persists the schedule and returns the fresh problem,
  // so we only sync local state — advancing only if the review succeeded.
  const handleGrade = async (gradeItem) => {
    if (!currentCard) return;

    setGradeError(null);
    try {
      const res = await api.reviewProblem(currentCard.id, gradeItem.key);
      onUpdateProblem(res);
      // Proceed to next card
      setCurrentIndex(prev => prev + 1);
    } catch (err) {
      console.error('Failed to review problem:', err.message);
      setGradeError(`Couldn't save your "${gradeItem.key}" grade — check that the backend is running, then try again.`);
    }
  };

  const progressPercentage = totalCards ? Math.round((currentIndex / totalCards) * 100) : 0;

  // Queue selection — revise the checked subset, or everything when none checked
  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const allSelected = totalCards > 0 && sessionProblems.every(p => selectedIds.includes(p.id));
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : sessionProblems.map(p => p.id));
  };

  const handleStartSession = () => {
    if (selectedIds.length > 0) {
      setSessionProblems(prev => prev.filter(p => selectedIds.includes(p.id)));
    }
    setSelectedIds([]);
    setSessionStarted(true);
  };

  // Clicking a row skips the button entirely — revise just that problem
  const handleReviseOne = (problem) => {
    setSessionProblems([problem]);
    setSelectedIds([]);
    setSessionStarted(true);
  };

  // Deep link: opening /revise/<id> starts a session for that problem as soon
  // as the problem list has loaded.
  const deepLinkTriedRef = useRef(false);
  useEffect(() => {
    if (deepLinkTriedRef.current || sessionStarted || problems.length === 0) return;
    deepLinkTriedRef.current = true;
    const match = window.location.pathname.match(/^\/revise\/([^/]+)$/);
    if (!match) return;
    const target = problems.find(p => p.id === match[1]);
    if (target) handleReviseOne(target);
    // handleReviseOne only touches state setters; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problems, sessionStarted]);

  // Deep link while already mounted: history navigation to /revise/<id>
  // doesn't remount this component (screen stays 'revise'), so react to
  // popstate directly — start that problem's session, or return to the queue
  // for plain /revise.
  useEffect(() => {
    const onPopState = () => {
      const match = window.location.pathname.match(/^\/revise\/([^/]+)$/);
      if (match) {
        const target = problems.find(p => p.id === match[1]);
        if (target) handleReviseOne(target);
      } else if (window.location.pathname === '/revise') {
        setSessionStarted(false);
        setCurrentIndex(0);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // handleReviseOne only touches state setters; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problems]);

  // Load the revision history for the card on screen
  useEffect(() => {
    if (!sessionStarted || !currentCard?.id) return;
    let cancelled = false;
    setReviewHistory(null);
    setGradeError(null);
    api.getProblemReviews(currentCard.id)
      .then((rows) => { if (!cancelled) setReviewHistory(rows || []); })
      .catch(() => { if (!cancelled) setReviewHistory([]); });
    return () => { cancelled = true; };
  }, [sessionStarted, currentCard?.id]);

  const gradeColor = (key) =>
    GRADES.find(g => g.key === key)?.c || 'var(--color-text-muted)';

  // Keep the URL naming the question being revised: /revise/<id> during the
  // session, plain /revise on the queue and completion screens.
  useEffect(() => {
    if (!window.location.pathname.startsWith('/revise')) return;
    const path = sessionStarted && currentCard ? `/revise/${currentCard.id}` : '/revise';
    if (window.location.pathname !== path) {
      window.history.replaceState(null, '', path);
    }
  }, [sessionStarted, currentCard]);

  // Queue Overview — list every question in the session before it starts
  if (!sessionStarted) {
    return (
      <div className="w-full h-full overflow-y-auto custom-scrollbar">
        <div className="max-w-[1140px] mx-auto px-sp-30 pt-sp-26 pb-10 flex flex-col gap-4">
          {/* Header section */}
          <div className="flex items-center justify-between">
            <div className="text-left">
              <div className="text-fs-21 font-bold text-text-main tracking-[-0.015em]">
                {customProblems ? 'Forced revision' : 'Revision queue'}
              </div>
              <div className="font-mono text-fs-12 text-text-muted mt-1">
                {totalCards} {totalCards === 1 ? 'problem' : 'problems'} · spoiler-free recall session
                {selectedIds.length > 0 && (
                  <span className="text-accent"> · {selectedIds.length} selected</span>
                )}
              </div>
            </div>

            <Button onClick={handleStartSession} disabled={totalCards === 0}>
              {selectedIds.length > 0
                ? `Revise ${selectedIds.length} selected →`
                : 'Start revision →'}
            </Button>
          </div>

          {/* Queue list */}
          <div className="bg-bg-card border border-border-card rounded-xl overflow-hidden flex flex-col">
            {/* Table Header */}
            <div className="grid grid-cols-[38px_2.1fr_0.95fr_62px_116px_78px] gap-3 px-sp-18 py-sp-11 border-b border-border-muted font-mono text-fs-9-5 text-border-accent tracking-[0.06em] text-left items-center">
              <div className="flex items-center justify-center">
                {allSelected ? (
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="cursor-pointer" onClick={toggleSelectAll}>
                    <rect x="2" y="2" width="16" height="16" rx="4" fill="var(--color-accent)" />
                    <path d="M6 10l3 3 5-5" stroke="var(--color-text-dark)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-text-muted hover:text-text-main cursor-pointer transition-colors duration-150" onClick={toggleSelectAll}>
                    <rect x="2" y="2" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="2" />
                  </svg>
                )}
              </div>
              <span>TITLE</span>
              <span>TOPIC</span>
              <span>DIFF</span>
              <span>LAST REV</span>
              <span className="text-right">DUE</span>
            </div>

            {/* Table Rows */}
            <div className="flex flex-col">
              {sessionProblems.map((row) => {
                const isSelected = selectedIds.includes(row.id);
                return (
                  <div
                    key={row.id}
                    onClick={() => handleReviseOne(row)}
                    title="Revise this problem now"
                    className={`grid grid-cols-[38px_2.1fr_0.95fr_62px_116px_78px] gap-3 items-center px-sp-18 py-3 border-b border-bg-element-dark cursor-pointer text-left hover:bg-bg-element-hover transition-colors duration-150 ${isSelected ? 'bg-bg-element-hover/50' : ''}`}
                  >
                    <div className="flex items-center justify-center" onClick={(e) => { e.stopPropagation(); toggleSelect(row.id); }}>
                      {isSelected ? (
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="cursor-pointer">
                          <rect x="2" y="2" width="16" height="16" rx="4" fill="var(--color-accent)" />
                          <path d="M6 10l3 3 5-5" stroke="var(--color-text-dark)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-text-muted hover:text-text-main cursor-pointer transition-colors duration-150">
                          <rect x="2" y="2" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      )}
                    </div>
                    <span className="text-fs-13-5 text-text-main font-medium truncate">
                      {row.title}
                    </span>
                    <span className="font-mono text-fs-11-5 text-text-hover truncate">
                      {row.topic}
                    </span>
                    <Badge type="difficulty" value={row.difficulty} />
                    <span className="font-mono text-fs-11 text-text-muted">
                      {row.lastRevised || '—'}
                    </span>
                    <span className={`font-mono text-fs-11 text-right ${row.due ? 'text-accent' : 'text-text-muted'}`}>
                      {row.due ? 'today' : row.nextLabel || '—'}
                    </span>
                  </div>
                );
              })}

              {totalCards === 0 && (
                <div className="py-10 px-5 text-text-muted text-fs-14 text-center">
                  No problems due for revision right now. Nice job staying on top of your schedule!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                {customProblems ? 'FORCED REVISION · SPOILER-FREE' : 'REVISION · SPOILER-FREE'}
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
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 mt-2.5 font-mono text-fs-11">
              {/* Topic pill */}
              <span className="inline-flex items-center px-2 py-sp-2 rounded-md border border-border-muted bg-bg-card text-text-hover">
                {currentCard.topic}
              </span>

              {/* Last revised (or a gentle "new" state when never revised) */}
              {currentCard.lastRevised && currentCard.lastRevised !== '—' ? (
                <span className="inline-flex items-center gap-1.5 text-text-muted" title="Last revised">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7.5V12l3 1.5" />
                  </svg>
                  {currentCard.lastRevised}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-text-muted" title="Not revised yet">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                  Not revised yet
                </span>
              )}

              {/* Created */}
              <span className="inline-flex items-center gap-1.5 text-text-muted" title="Created">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <rect x="3.5" y="5" width="17" height="15" rx="2" />
                  <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
                </svg>
                created {currentCard.created}
              </span>
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

            {/* Revision history */}
            <div className="mt-5 bg-bg-card border border-border-card rounded-xl p-5 text-left">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-mono text-fs-11 text-text-muted tracking-[0.08em]">
                  <span className="w-[3px] h-[14px] rounded-full bg-accent inline-block" />
                  REVISION HISTORY
                </div>
                <span className="font-mono text-fs-11 text-accent bg-accent/10 border border-accent/25 rounded-md px-2 py-0.5">
                  {reviewHistory ? reviewHistory.length : currentCard.revisions || 0}×
                </span>
              </div>

              {reviewHistory === null ? (
                <div className="font-mono text-fs-11 text-text-muted pt-4 pb-1">Loading…</div>
              ) : reviewHistory.length === 0 ? (
                <div className="text-fs-12-5 text-text-muted pt-4 pb-1">
                  No revisions yet — this is your first attempt at recalling this problem.
                </div>
              ) : (
                <div className="flex flex-col mt-2">
                  {reviewHistory.map((log, idx) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-3 py-2.5 border-b border-bg-element-dark last:border-b-0"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: gradeColor(log.grade) }}
                      />
                      <span className="text-fs-13 font-semibold text-text-main">
                        Revision {idx + 1}
                      </span>
                      <span className="font-mono text-fs-11 text-text-muted ml-auto">
                        {new Date(log.reviewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <span
                        className="text-fs-12 font-semibold border border-border-main bg-bg-code rounded-md px-2.5 py-1"
                        style={{ color: gradeColor(log.grade) }}
                      >
                        {log.grade}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                {gradeError && (
                  <div className="text-fs-12 text-center" style={{ color: 'var(--color-accent-red)' }}>
                    {gradeError}
                  </div>
                )}
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
                        {gradeIntervalLabel(currentCard, g)}
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
                setSessionStarted(false);
                setCurrentIndex(0);
                setRevealedApproaches({});
              }}
              disabled={customProblems ? customProblems.length === 0 : problems.filter(p => p.due).length === 0}
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

