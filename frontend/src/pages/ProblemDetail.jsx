import React, { useState, useEffect, useRef } from 'react';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Checklist from '../components/common/Checklist';

// Simple Markdown to HTML formatter for editorial solutions (matching LeetCodeLibrary)
const formatMarkdown = (text) => {
  if (!text) return '';
  let html = text
    .replace(/^### (.*$)/gim, '<h4 class="text-fs-14 font-semibold text-text-main mt-4 mb-1.5">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 class="text-fs-16 font-bold text-text-main mt-5 mb-2 border-b border-border-main pb-1">$1</h3>')
    .replace(/^# (.*$)/gim, '<h2 class="text-fs-18 font-extrabold text-text-main mt-6 mb-3">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-text-main font-semibold">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-bg-code border border-border-muted px-1.5 py-0.5 rounded text-fs-12 font-mono text-accent">$1</code>')
    .replace(/```python([\s\S]*?)```/g, '<pre class="bg-bg-code border border-border-muted rounded-lg p-3 my-3.5 font-mono text-fs-12 text-left overflow-x-auto whitespace-pre"><code class="text-text-main">$1</code></pre>')
    .replace(/```javascript([\s\S]*?)```/g, '<pre class="bg-bg-code border border-border-muted rounded-lg p-3 my-3.5 font-mono text-fs-12 text-left overflow-x-auto whitespace-pre"><code class="text-text-main">$1</code></pre>')
    .replace(/```java([\s\S]*?)```/g, '<pre class="bg-bg-code border border-border-muted rounded-lg p-3 my-3.5 font-mono text-fs-12 text-left overflow-x-auto whitespace-pre"><code class="text-text-main">$1</code></pre>')
    .replace(/```cpp([\s\S]*?)```/g, '<pre class="bg-bg-code border border-border-muted rounded-lg p-3 my-3.5 font-mono text-fs-12 text-left overflow-x-auto whitespace-pre"><code class="text-text-main">$1</code></pre>')
    .replace(/```([\s\S]*?)```/g, '<pre class="bg-bg-code border border-border-muted rounded-lg p-3 my-3.5 font-mono text-fs-12 text-left overflow-x-auto whitespace-pre"><code class="text-text-main">$1</code></pre>')
    .replace(/^\* (.*$)/gim, '<li class="ml-4 list-disc my-1 text-fs-13.5">$1</li>')
    .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc my-1 text-fs-13.5">$1</li>')
    .replace(/\$\$(.*?)\$\$/g, '<span class="font-mono bg-bg-code/30 px-1 py-0.5 rounded text-fs-12">$1</span>');

  return html
    .split('\n')
    .map((line) => {
      if (
        line.trim().startsWith('<h') ||
        line.trim().startsWith('<li') ||
        line.trim().startsWith('<pre') ||
        line.trim().startsWith('</pre') ||
        line.trim().startsWith('<code') ||
        line.trim().startsWith('</code')
      ) {
        return line;
      }
      return line ? `<p class="my-2 text-fs-13.5 leading-relaxed text-text-hover">${line}</p>` : '';
    })
    .join('');
};

const LANGUAGES = ['Python', 'JavaScript', 'Java', 'C++', 'Go', 'Rust', 'TypeScript'];

export default function ProblemDetail({
  problem,
  onBack,
  onUpdateProblem,
  onDeleteProblems,
  templatePatterns = [],
  themeColor
}) {
  // Navigation tabs for left pane: 'description' | 'editorial' | 'checklist'
  const [leftTab, setLeftTab] = useState('description');
  
  // State for approaches & notes
  const [approaches, setApproaches] = useState([]);
  const [activeApproachIdx, setActiveApproachIdx] = useState(0);
  const [notes, setNotes] = useState('');
  
  // UI Spoilers / Hint disclosures
  const [revealedEditorial, setRevealedEditorial] = useState(false);
  const [revealedHints, setRevealedHints] = useState({});
  const [toastMessage, setToastMessage] = useState('');

  // Refs for editor scroll sync
  const textareaRef = useRef(null);
  const gutterRef = useRef(null);

  // Load problem details into local states
  useEffect(() => {
    if (problem) {
      const defaultApproaches = problem.approaches && problem.approaches.length > 0
        ? problem.approaches
        : [
            {
              id: 'default',
              name: 'Default Approach',
              complexityTime: '',
              complexitySpace: '',
              approach: problem.approach || '',
              code: problem.solution || '// Add your code solution here',
              lang: 'Python'
            }
          ];
      
      setApproaches(defaultApproaches);
      setNotes(problem.notes || '');
      setActiveApproachIdx(0);
      setRevealedEditorial(false);
      setRevealedHints({});
    }
  }, [problem?.id, problem]);

  if (!problem) {
    return (
      <div className="p-10 text-text-muted text-center">
        Problem not found.
      </div>
    );
  }

  // Handle local text inputs
  const handleUpdateApproachField = (field, value) => {
    setApproaches((prev) =>
      prev.map((appr, idx) => (idx === activeApproachIdx ? { ...appr, [field]: value } : appr))
    );
  };

  // Add a new solution approach variation
  const handleAddApproach = () => {
    const nextIdx = approaches.length + 1;
    const newApproach = {
      id: `new_${Date.now()}`,
      name: `Approach ${nextIdx}`,
      complexityTime: '',
      complexitySpace: '',
      approach: '',
      code: '// Add your code solution here',
      lang: 'Python'
    };
    setApproaches((prev) => [...prev, newApproach]);
    setActiveApproachIdx(approaches.length);
  };

  // Delete an approach variation
  const handleDeleteApproach = (indexToDelete, e) => {
    e.stopPropagation();
    if (approaches.length <= 1) return;
    
    const updated = approaches.filter((_, idx) => idx !== indexToDelete);
    setApproaches(updated);
    setActiveApproachIdx((prev) => (prev >= updated.length ? updated.length - 1 : prev));
  };

  // Save changes locally and trigger backend callback
  const handleSave = () => {
    // Sync back flat structure for compatibility, picking the first approach
    const primaryApproach = approaches[0] || {};
    
    const updated = {
      ...problem,
      approach: primaryApproach.approach || '',
      solution: primaryApproach.code || '',
      notes: notes,
      approaches: approaches
    };
    
    onUpdateProblem(updated);
    
    // Show smooth feedback
    setToastMessage('Workspace saved successfully!');
    setTimeout(() => setToastMessage(''), 2500);
  };

  const handleMarkComplete = () => {
    const primaryApproach = approaches[0] || {};
    const updated = {
      ...problem,
      status: 'Done',
      due: false,
      lastRevised: 'just now',
      nextLabel: 'in 6 days',
      revisions: (problem.revisions || 0) + 1,
      approach: primaryApproach.approach || '',
      solution: primaryApproach.code || '',
      notes: notes,
      approaches: approaches
    };
    onUpdateProblem(updated);
    
    setToastMessage('Problem completed!');
    setTimeout(() => setToastMessage(''), 2500);
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this problem? This action cannot be undone.")) {
      onDeleteProblems([problem.id]);
    }
  };

  // Spaced Repetition Checklist Progress mapping
  const checklistLabels = [
    'Pick a pattern',
    'Read the statement',
    'Write your approach',
    'Code the solution',
    'Add notes / learnings',
    'Mark complete'
  ];

  const defaultDoneCount = problem.status === 'Done' ? 6 : problem.status === 'Solving' ? 4 : 0;
  
  const checklistItems = checklistLabels.map((label, idx) => {
    const isDone = problem.checklistProgress 
      ? problem.checklistProgress[idx] 
      : idx < defaultDoneCount;

    return {
      label,
      done: isDone,
      current: idx === (problem.checklistProgress ? problem.checklistProgress.filter(Boolean).length : defaultDoneCount),
      color: isDone ? 'var(--color-text-hover)' : (idx === defaultDoneCount ? 'var(--color-text-main)' : 'var(--color-text-muted)'),
      strike: isDone ? 'line-through' : 'none'
    };
  });

  const handleToggleStep = (stepIndex) => {
    const currentProgress = problem.checklistProgress 
      ? [...problem.checklistProgress] 
      : Array(6).fill(false).map((_, i) => i < defaultDoneCount);

    currentProgress[stepIndex] = !currentProgress[stepIndex];
    
    let newStatus = problem.status;
    let isDue = problem.due;
    
    const checkedCount = currentProgress.filter(Boolean).length;
    if (currentProgress[5]) { 
      newStatus = 'Done';
      isDue = false;
    } else if (checkedCount > 0) {
      newStatus = 'Solving';
    } else {
      newStatus = 'Not started';
    }

    const primaryApproach = approaches[0] || {};
    onUpdateProblem({
      ...problem,
      status: newStatus,
      due: isDue,
      checklistProgress: currentProgress,
      approach: primaryApproach.approach || '',
      solution: primaryApproach.code || '',
      notes: notes,
      approaches: approaches
    });
  };

  // Sync editor scrolling
  const handleScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Quick insertion of template patterns
  const handleInsertTemplate = (variationCode) => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentCode = approaches[activeApproachIdx]?.code || '';
      
      const newCode = currentCode.substring(0, start) + variationCode + currentCode.substring(end);
      handleUpdateApproachField('code', newCode);
      
      // Refocus & set selection after insertion
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variationCode.length, start + variationCode.length);
      }, 0);
    }
  };

  const activeApproach = approaches[activeApproachIdx] || {};
  const codeLinesCount = (activeApproach.code || '').split('\n').length || 1;
  const lineNumbers = Array.from({ length: Math.max(codeLinesCount, 25) }, (_, i) => i + 1);

  return (
    <div className="w-full h-full flex flex-col bg-[#050505] text-[#eaeaea] overflow-hidden select-none">
      
      {/* Workspace Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-bg-card border-b border-border-main shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <button 
            onClick={onBack} 
            className="flex items-center justify-center p-1.5 rounded bg-[#111] hover:bg-[#222] border border-border-muted text-text-muted hover:text-text-main transition-colors cursor-pointer"
            title="Back to Problems"
          >
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="10" x2="1" y2="10" />
              <polyline points="10 19 1 10 10 1" />
            </svg>
          </button>
          
          <div className="flex items-center gap-3 truncate">
            <span className="font-mono text-fs-12 text-text-muted">
              {problem.topic}
            </span>
            <span className="text-[#333]">/</span>
            <span className="text-fs-16 font-bold text-text-main truncate">
              {problem.title}
            </span>
            <Badge type="difficulty" value={problem.difficulty} />
            <Badge type="status" value={problem.status} />
          </div>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-3 shrink-0">
          {problem.leetcodeUrl && (
            <a
              href={problem.leetcodeUrl}
              target="_blank"
              rel="noreferrer"
              className="text-fs-12 text-accent border border-accent/25 bg-accent/5 hover:bg-accent/15 px-3 py-1.5 rounded-card-btn transition-all font-mono"
            >
              LeetCode ↗
            </a>
          )}
          <Button 
            variant="red" 
            onClick={handleDelete}
            className="cursor-pointer"
          >
            Delete
          </Button>
          <Button 
            variant="secondary" 
            onClick={handleSave}
            className="cursor-pointer"
          >
            Save Solution
          </Button>
          <Button 
            onClick={handleMarkComplete}
            disabled={problem.status === 'Done'}
            className="cursor-pointer"
          >
            {problem.status === 'Done' ? '✓ Completed' : 'Mark complete'}
          </Button>
        </div>
      </div>

      {/* Split Pane Container */}
      <div className="flex-1 w-full flex overflow-hidden min-h-0 relative">
        
        {/* Toast Notification */}
        {toastMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-[#10b981] text-black text-fs-12 font-bold px-4 py-2 rounded-md shadow-lg flex items-center gap-2 animate-bounce">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {toastMessage}
          </div>
        )}

        {/* LEFT PANE (Problem Details) */}
        <div className="w-[45%] h-full border-r border-border-main flex flex-col bg-[#080808] min-w-[350px]">
          {/* Tab bar */}
          <div className="flex bg-[#000] border-b border-border-muted shrink-0 text-fs-11 font-mono tracking-wider text-text-muted">
            <button
              onClick={() => setLeftTab('description')}
              className={`px-5 py-3 border-r border-border-muted cursor-pointer transition-colors ${
                leftTab === 'description'
                  ? 'bg-[#080808] text-text-main border-b-2 border-b-accent'
                  : 'hover:bg-bg-element-hover hover:text-text-main'
              }`}
            >
              DESCRIPTION
            </button>
            <button
              onClick={() => setLeftTab('editorial')}
              className={`px-5 py-3 border-r border-border-muted cursor-pointer transition-colors ${
                leftTab === 'editorial'
                  ? 'bg-[#080808] text-text-main border-b-2 border-b-accent'
                  : 'hover:bg-bg-element-hover hover:text-text-main'
              }`}
            >
              EDITORIAL
            </button>
            <button
              onClick={() => setLeftTab('checklist')}
              className={`px-5 py-3 cursor-pointer transition-colors ${
                leftTab === 'checklist'
                  ? 'bg-[#080808] text-text-main border-b-2 border-b-accent'
                  : 'hover:bg-bg-element-hover hover:text-text-main'
              }`}
            >
              CHECKLIST & NOTES
            </button>
          </div>

          {/* Left Tab Content (Scrollable) */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar text-left text-fs-13.5 leading-relaxed">
            
            {/* Description Tab */}
            {leftTab === 'description' && (
              <div className="flex flex-col gap-6 select-text">
                <div>
                  <h1 className="text-fs-20 font-bold text-text-main leading-tight mb-2">
                    {problem.title}
                  </h1>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {problem.categoryTitle && (
                      <span className="font-mono text-fs-10 text-text-muted bg-white/4 px-2 py-0.5 rounded">
                        {problem.categoryTitle}
                      </span>
                    )}
                    {problem.patterns && problem.patterns.map((pat, idx) => (
                      <span
                        key={idx}
                        className="font-mono text-fs-10 text-accent bg-accent/5 border border-accent/15 px-2 py-0.5 rounded"
                      >
                        {pat}
                      </span>
                    ))}
                  </div>
                </div>

                <hr className="border-border-muted" />

                {/* Problem Statement */}
                <div>
                  <div className="font-mono text-[10px] text-border-accent tracking-[0.05em] mb-3">
                    PROBLEM STATEMENT
                  </div>
                  <div
                    className="leetcode-statement leading-relaxed text-text-code"
                    dangerouslySetInnerHTML={{
                      __html: problem.statement || '<span class="text-text-muted">No description available.</span>'
                    }}
                  />
                </div>

                {/* Example inputs/outputs */}
                {(problem.exIn || problem.exOut) && (
                  <div className="bg-bg-code border border-border-muted rounded-lg p-4 font-mono text-fs-12 text-text-code whitespace-pre">
                    {problem.exIn && (
                      <div>
                        <span className="text-text-muted select-none">Input: </span>
                        {problem.exIn}
                      </div>
                    )}
                    {problem.exOut && (
                      <div className="mt-1">
                        <span className="text-text-muted select-none">Output: </span>
                        {problem.exOut}
                      </div>
                    )}
                  </div>
                )}

                {/* Expandable Hints */}
                {problem.hints && problem.hints.length > 0 && (
                  <div>
                    <div className="font-mono text-[10px] text-border-accent tracking-[0.05em] mb-2.5">
                      HINTS ({problem.hints.length})
                    </div>
                    <div className="flex flex-col gap-2">
                      {problem.hints.map((hint, idx) => {
                        const isRevealed = revealedHints[idx];
                        return (
                          <div
                            key={idx}
                            className="border border-border-main rounded-md bg-bg-card overflow-hidden"
                          >
                            <div
                              onClick={() =>
                                setRevealedHints((prev) => ({ ...prev, [idx]: !prev[idx] }))
                              }
                              className="px-3.5 py-2.5 cursor-pointer bg-white/1.5 hover:bg-white/3 flex items-center justify-between text-fs-12 text-text-main select-none transition-colors"
                            >
                              <span className="font-semibold font-sans">Hint {idx + 1}</span>
                              <span className="font-mono text-text-muted text-[10px]">
                                {isRevealed ? '▲ HIDE' : '▼ SHOW'}
                              </span>
                            </div>
                            {isRevealed && (
                              <div
                                className="p-3 text-fs-12-5 text-text-hover border-t border-border-main bg-bg-code/40 select-text"
                                dangerouslySetInnerHTML={{ __html: hint }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Stats & similar questions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  {/* Stats Card */}
                  {problem.stats && Object.keys(problem.stats).length > 0 && (
                    <div className="bg-bg-card border border-border-card rounded-xl p-4 flex flex-col gap-2">
                      <div className="text-fs-12 font-semibold text-text-main font-mono">
                        Submission Stats
                      </div>
                      <div className="flex flex-col gap-1.5 font-mono text-fs-11 text-text-muted">
                        <div className="flex justify-between">
                          <span>Acceptance Rate</span>
                          <span className="text-accent">{problem.stats.acRate}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Total Accepted</span>
                          <span className="text-text-hover">{problem.stats.totalAccepted}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Total Submissions</span>
                          <span className="text-text-hover">{problem.stats.totalSubmission}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Likes/Dislikes */}
                  {(problem.likes > 0 || problem.dislikes > 0) && (
                    <div className="bg-bg-card border border-border-card rounded-xl p-4 flex items-center justify-around">
                      <div className="flex flex-col items-center">
                        <span className="text-green-400 font-bold text-fs-15">{problem.likes.toLocaleString()}</span>
                        <span className="text-text-muted text-[10px] font-mono mt-1">LIKES</span>
                      </div>
                      <div className="w-[1px] h-8 bg-border-main"></div>
                      <div className="flex flex-col items-center">
                        <span className="text-red-400 font-bold text-fs-15">{problem.dislikes.toLocaleString()}</span>
                        <span className="text-text-muted text-[10px] font-mono mt-1">DISLIKES</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Similar Questions */}
                {problem.similarQuestions && problem.similarQuestions.length > 0 && (
                  <div>
                    <div className="font-mono text-[10px] text-border-accent tracking-[0.05em] mb-2.5">
                      SIMILAR QUESTIONS
                    </div>
                    <div className="flex flex-col gap-2">
                      {problem.similarQuestions.map((sq, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 bg-bg-card border border-border-main rounded-md"
                        >
                          <div className="flex flex-col text-left min-w-0">
                            <span className="text-text-hover font-medium truncate pr-2">
                              {sq.title}
                            </span>
                            <span className="text-[10px] text-text-muted font-mono mt-0.5">
                              {sq.difficulty}
                            </span>
                          </div>
                          <a
                            href={`https://leetcode.com/problems/${sq.titleSlug}/`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent hover:underline text-fs-11 font-mono shrink-0"
                          >
                            Solve ↗
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Editorial Solution Tab */}
            {leftTab === 'editorial' && (
              <div className="flex flex-col gap-4 select-text">
                <h3 className="text-fs-16 font-bold text-text-main font-mono">
                  Editorial Solution
                </h3>
                
                {!problem.solutionContent ? (
                  <div className="py-12 text-center text-text-muted text-fs-13">
                    No editorial solution loaded for this question.
                  </div>
                ) : !revealedEditorial ? (
                  <div className="border border-dashed border-border-main bg-bg-card p-6 rounded-xl flex flex-col items-center gap-3">
                    <span className="text-fs-13 text-text-muted">
                      Contains spoilers! Detailed editorial explanations ahead.
                    </span>
                    <Button
                      size="sm"
                      onClick={() => setRevealedEditorial(true)}
                      className="cursor-pointer"
                    >
                      Reveal Solution Article
                    </Button>
                  </div>
                ) : (
                  <div className="border border-border-main bg-bg-card p-5 rounded-xl overflow-hidden relative">
                    <div className="flex items-center justify-between mb-4 border-b border-border-main pb-2">
                      <span className="font-semibold text-fs-13 text-accent font-mono">
                        Solution Article
                      </span>
                      <button
                        onClick={() => setRevealedEditorial(false)}
                        className="font-mono text-fs-10 text-text-muted hover:text-text-main cursor-pointer bg-transparent border-none"
                      >
                        [HIDE spoilers]
                      </button>
                    </div>
                    <div
                      className="leetcode-solution text-fs-13.5 leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: formatMarkdown(problem.solutionContent)
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Checklist & Notes Tab */}
            {leftTab === 'checklist' && (
              <div className="flex flex-col gap-6">
                {/* Checklist widget */}
                <div className="bg-bg-card border border-border-card rounded-xl p-5">
                  <div className="text-fs-14 font-bold text-text-main mb-3 font-mono">
                    Solve Checklist
                  </div>
                  <Checklist 
                    checklist={checklistItems} 
                    onToggleStep={handleToggleStep}
                  />
                </div>

                {/* Notes Section */}
                <div className="flex flex-col gap-2.5">
                  <label className="font-mono text-fs-11 text-text-muted tracking-[0.05em]">
                    WORKSPACE NOTES &amp; LEARNINGS
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={12}
                    placeholder="Write your learnings, core concepts, or pitfalls here. These notes are shared across all approaches."
                    className="bg-bg-code border border-border-main rounded-xl p-4 text-[#ffffff] font-sans text-fs-13.5 leading-[1.6] outline-none w-full focus:border-accent transition-colors resize-y select-text"
                  />
                </div>

                {/* Spaced Repetition Meta Card */}
                <div className="bg-bg-card border border-border-card rounded-xl p-4 flex flex-col gap-2.5 font-mono text-fs-11 text-text-muted select-text">
                  <div className="flex justify-between">
                    <span>Problem Created</span>
                    <span className="text-text-hover">{problem.created}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Last Revised</span>
                    <span className="text-text-hover">{problem.lastRevised}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Next Spaced Review</span>
                    <span className={problem.due ? 'text-accent font-semibold' : 'text-text-hover'}>
                      {problem.due ? 'TODAY' : problem.nextLabel}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANE (Code Playground) */}
        <div className="flex-1 h-full flex flex-col bg-[#050505] min-w-[400px]">
          
          {/* Approaches tabs */}
          <div className="flex items-center justify-between bg-[#000] border-b border-border-muted px-4 shrink-0 text-fs-11 font-mono">
            <div className="flex items-center gap-0.5 overflow-x-auto select-none">
              {approaches.map((appr, idx) => (
                <div
                  key={appr.id}
                  onClick={() => setActiveApproachIdx(idx)}
                  className={`flex items-center gap-2 px-4 py-3 border-r border-border-muted cursor-pointer transition-colors relative ${
                    activeApproachIdx === idx
                      ? 'bg-[#050505] text-text-main border-b-2 border-b-accent font-semibold'
                      : 'hover:bg-bg-element-hover hover:text-text-hover'
                  }`}
                >
                  <span className="max-w-[120px] truncate">{appr.name}</span>
                  
                  {approaches.length > 1 && (
                    <button
                      onClick={(e) => handleDeleteApproach(idx, e)}
                      className="text-text-muted hover:text-red-400 p-0.5 rounded hover:bg-white/5 transition-colors cursor-pointer bg-transparent border-none"
                      title="Delete Approach"
                    >
                      <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}

              <button
                onClick={handleAddApproach}
                className="px-4 py-3 text-accent hover:text-text-main hover:bg-bg-element-hover transition-colors font-mono cursor-pointer bg-transparent border-none border-r border-border-muted"
                title="Add new approach variation"
              >
                + ADD APPROACH
              </button>
            </div>

            {/* Template inserter */}
            {templatePatterns.length > 0 && (
              <div className="relative shrink-0 flex items-center py-2">
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleInsertTemplate(e.target.value);
                      e.target.value = ""; // Reset selector
                    }
                  }}
                  className="text-fs-11 text-accent border border-accent/25 hover:border-accent/40 bg-accent/5 rounded-md px-2 py-1 cursor-pointer outline-none max-w-sp-200"
                >
                  <option value="">Insert template pattern...</option>
                  {templatePatterns.map((pat) => (
                    <optgroup key={pat.id} label={pat.name}>
                      {pat.variations.map((v) => (
                        <option key={v.id} value={v.code}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Active approach panel */}
          {activeApproach && (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              
              {/* Approach settings bar */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1.1fr] gap-3 px-6 py-3.5 bg-[#080808] border-b border-border-main shrink-0 items-center">
                {/* Name */}
                <div className="flex flex-col gap-1 text-left">
                  <label className="font-mono text-[9px] text-text-muted tracking-[0.05em] uppercase">Approach Name</label>
                  <input
                    type="text"
                    value={activeApproach.name || ''}
                    onChange={(e) => handleUpdateApproachField('name', e.target.value)}
                    placeholder="e.g. Optimal (Two Pointers)"
                    className="bg-bg-code border border-border-main rounded-md px-2.5 py-1 text-text-main text-fs-12.5 outline-none focus:border-accent transition-colors w-full"
                  />
                </div>

                {/* Time complexity */}
                <div className="flex flex-col gap-1 text-left">
                  <label className="font-mono text-[9px] text-text-muted tracking-[0.05em] uppercase">Time Compl.</label>
                  <input
                    type="text"
                    value={activeApproach.complexityTime || ''}
                    onChange={(e) => handleUpdateApproachField('complexityTime', e.target.value)}
                    placeholder="e.g. O(N)"
                    className="bg-bg-code border border-border-main rounded-md px-2.5 py-1 text-text-main text-fs-12.5 outline-none focus:border-accent transition-colors w-full font-mono"
                  />
                </div>

                {/* Space complexity */}
                <div className="flex flex-col gap-1 text-left">
                  <label className="font-mono text-[9px] text-text-muted tracking-[0.05em] uppercase">Space Compl.</label>
                  <input
                    type="text"
                    value={activeApproach.complexitySpace || ''}
                    onChange={(e) => handleUpdateApproachField('complexitySpace', e.target.value)}
                    placeholder="e.g. O(1)"
                    className="bg-bg-code border border-border-main rounded-md px-2.5 py-1 text-text-main text-fs-12.5 outline-none focus:border-accent transition-colors w-full font-mono"
                  />
                </div>

                {/* Language select */}
                <div className="flex flex-col gap-1 text-left">
                  <label className="font-mono text-[9px] text-text-muted tracking-[0.05em] uppercase">Language</label>
                  <select
                    value={activeApproach.lang || 'Python'}
                    onChange={(e) => handleUpdateApproachField('lang', e.target.value)}
                    className="bg-bg-code border border-border-main rounded-md px-2 py-1 text-text-main text-fs-12.5 outline-none focus:border-accent cursor-pointer transition-colors w-full"
                  >
                    {LANGUAGES.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Approach description input */}
              <div className="px-6 py-2.5 bg-[#080808]/40 border-b border-border-main shrink-0 flex flex-col gap-1 text-left">
                <label className="font-mono text-[9px] text-text-muted tracking-[0.05em] uppercase">Approach Logic / Strategy Explanation</label>
                <textarea
                  value={activeApproach.approach || ''}
                  onChange={(e) => handleUpdateApproachField('approach', e.target.value)}
                  rows={2}
                  placeholder="Explain the strategy, data structures used, or recursive relations..."
                  className="bg-bg-code border border-border-main rounded-md px-3 py-2 text-[#ffffff] font-sans text-fs-12.5 outline-none focus:border-accent transition-colors resize-none select-text"
                />
              </div>

              {/* Code Playground area (Scrollable code block) */}
              <div className="flex-1 flex overflow-hidden min-h-0 bg-[#0a0a0a] relative select-text">
                
                {/* Line Gutter */}
                <div
                  ref={gutterRef}
                  id="line-gutter"
                  className="w-10 select-none bg-[#0a0a0a] border-r border-border-muted/30 text-right pr-2.5 py-4 font-mono text-[11.5px] leading-[1.65] text-[#333] overflow-hidden shrink-0"
                >
                  {lineNumbers.map((num) => (
                    <div key={num} className="h-[19px]">
                      {num}
                    </div>
                  ))}
                </div>

                {/* Code Textarea */}
                <textarea
                  ref={textareaRef}
                  value={activeApproach.code || ''}
                  onChange={(e) => handleUpdateApproachField('code', e.target.value)}
                  onScroll={handleScroll}
                  placeholder="// Type your solution here..."
                  className="flex-1 bg-transparent border-none outline-none p-4 font-mono text-[11.5px] leading-[1.65] text-text-code whitespace-pre overflow-auto resize-none h-full focus:ring-0 select-text"
                  spellCheck="false"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
