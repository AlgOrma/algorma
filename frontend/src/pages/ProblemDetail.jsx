import React, { useState } from 'react';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Checklist from '../components/common/Checklist';
import CodeBlock from '../components/common/CodeBlock';

export default function ProblemDetail({
  problem,
  onBack,
  onUpdateProblem
}) {
  const [revealed, setRevealed] = useState(false);

  if (!problem) {
    return (
      <div className="p-10 text-text-muted text-center">
        Problem not found.
      </div>
    );
  }

  // Handle marking problem as completed
  const handleMarkComplete = () => {
    const updated = {
      ...problem,
      status: 'Done',
      due: false,
      lastRevised: 'just now',
      nextLabel: 'in 6 days',
      revisions: (problem.revisions || 0) + 1
    };
    onUpdateProblem(updated);
  };

  // Helper to build dynamic checklist state
  const checklistLabels = [
    'Pick a pattern',
    'Read the statement',
    'Write your approach',
    'Code the solution',
    'Add notes / learnings',
    'Mark complete'
  ];

  // Map database status to default checklist progression
  // if problems doesn't have custom checklistState stored
  const defaultDoneCount = problem.status === 'Done' ? 6 : problem.status === 'Solving' ? 4 : 0;
  
  // Initialize checklist items based on problem state
  const checklistItems = checklistLabels.map((label, idx) => {
    // Check if problem has custom checklist progress stored
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
    
    // Auto-update status if they check "Mark complete" or "Code the solution"
    let newStatus = problem.status;
    let isDue = problem.due;
    
    const checkedCount = currentProgress.filter(Boolean).length;
    if (currentProgress[5]) { // Last step checked
      newStatus = 'Done';
      isDue = false;
    } else if (checkedCount > 0) {
      newStatus = 'Solving';
    } else {
      newStatus = 'Not started';
    }

    onUpdateProblem({
      ...problem,
      status: newStatus,
      due: isDue,
      checklistProgress: currentProgress
    });
  };

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1140px] mx-auto px-sp-30 pt-sp-22 pb-10 flex flex-col gap-4">
      {/* Header / Breadcrumbs */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 text-left">
          <div 
            onClick={onBack} 
            className="inline-flex items-center gap-1.5 font-mono text-fs-11-5 text-text-muted cursor-pointer hover:text-text-hover transition-colors duration-200"
          >
            ← Problems / {problem.topic}
          </div>
          
          <div className="flex items-center gap-sp-11 mt-sp-9 flex-wrap">
            <span className="text-fs-23 font-bold text-text-main tracking-[-0.015em]">
              {problem.title}
            </span>
            <Badge type="difficulty" value={problem.difficulty} />
            <Badge type="status" value={problem.status} />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-sp-9 items-center shrink-0">
          <Button 
            variant="secondary" 
            onClick={() => window.open(`https://leetcode.com/problems/${problem.title.toLowerCase().replace(/ /g, '-')}`, '_blank')}
          >
            Open on LeetCode ↗
          </Button>
          <Button 
            onClick={handleMarkComplete} 
            disabled={problem.status === 'Done'}
          >
            {problem.status === 'Done' ? 'Completed' : 'Mark complete'}
          </Button>
        </div>
      </div>

      {/* Main split details content */}
      <div className="flex gap-sp-18 items-start">
        
        {/* Left pane: Description, solution etc */}
        <div className="flex-[1.55_1.55_0%] min-w-0 flex flex-col gap-3.5">
          
          {/* Statement */}
          <div className="bg-bg-card border border-border-card rounded-xl py-sp-17 px-sp-19 text-left">
            <div className="font-mono text-fs-11 text-text-muted tracking-[0.05em] mb-2.5">
              PROBLEM STATEMENT
            </div>
            <div className="text-fs-14 leading-[1.7] text-text-code">
              {problem.statement}
            </div>
            {problem.exIn && (
              <div className="font-mono text-fs-12-5 text-text-muted mt-3 leading-[1.7] bg-bg-code border border-border-muted rounded-lg py-sp-11 px-sp-13">
                in:  {problem.exIn}<br />
                out: {problem.exOut}
              </div>
            )}
          </div>

          {/* Approach */}
          <div className="bg-bg-card border border-border-card rounded-xl py-sp-17 px-sp-19 text-left">
            <div className="font-mono text-fs-11 text-text-muted tracking-[0.05em] mb-2.5">
              MY APPROACH
            </div>
            <div className="text-fs-14 leading-[1.7] text-text-code">
              {problem.approach || 'No approach notes added yet.'}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-bg-card border border-border-card rounded-xl py-sp-17 px-sp-19 text-left">
            <div className="font-mono text-fs-11 text-text-muted tracking-[0.05em] mb-2.5">
              NOTES &amp; LEARNINGS
            </div>
            <div className="text-fs-14 leading-[1.7] text-text-code">
              {problem.notes || 'No notes added yet.'}
            </div>
          </div>

          {/* Solution CodeBlock */}
          <CodeBlock
            code={problem.solution || '// Add your code solution here'}
            isSpoiler={true}
            revealed={revealed}
            onToggleReveal={() => setRevealed(!revealed)}
            title="YOUR SOLUTION"
          />

        </div>

        {/* Right pane: Checklist, patterns, metadata */}
        <div className="flex-1 min-w-0 flex flex-col gap-3.5">
          
          {/* Checklist */}
          <div className="bg-bg-card border border-border-card rounded-xl py-sp-17 px-sp-18 text-left">
            <div className="text-fs-14 font-semibold text-text-main mb-sp-11">
              Solve checklist
            </div>
            <Checklist 
              checklist={checklistItems} 
              onToggleStep={handleToggleStep}
            />
          </div>

          {/* Linked patterns & Meta */}
          <div className="bg-bg-card border border-border-card rounded-xl py-sp-17 px-sp-18 text-left">
            <div className="text-fs-13 font-semibold text-text-main mb-sp-11">
              Linked patterns
            </div>
            <div className="flex flex-wrap gap-sp-7">
              {problem.patterns && problem.patterns.map((pat, idx) => (
                <span 
                  key={idx}
                  className="font-mono text-fs-11-5 text-accent bg-accent/10 border border-accent/22 px-2.5 py-1 rounded-card-xs"
                >
                  {pat}
                </span>
              ))}
              {(!problem.patterns || problem.patterns.length === 0) && (
                <span className="text-fs-12 text-text-muted">None linked.</span>
              )}
            </div>
            
            <div className="h-sp-1 bg-bg-track my-3.5"></div>
            
            <div className="flex flex-col gap-2.5 font-mono text-fs-11-5">
              <div className="flex justify-between">
                <span className="text-text-muted">created</span>
                <span className="text-text-hover">{problem.created}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">last revised</span>
                <span className="text-text-hover">{problem.lastRevised}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">next review</span>
                <span className={problem.due ? 'text-accent' : 'text-text-muted'}>
                  {problem.due ? 'today' : problem.nextLabel}
                </span>
              </div>
            </div>
          </div>

        </div>

      </div>
      </div>
    </div>
  );
}
