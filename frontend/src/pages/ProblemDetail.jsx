import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Checklist from '../components/common/Checklist';
import ConfirmationModal from '../components/common/ConfirmationModal';
import CodeEditor from '../components/common/CodeEditor';
import CustomListsModal from '../components/common/CustomListsModal';
import useDismissOnOutside from '../hooks/useDismissOnOutside';

// Simple Markdown to HTML formatter for editorial solutions (matching LeetCodeLibrary)
const formatMarkdown = (text) => {
  if (!text) return '';
  let html = text
    .replace(/^### (.*$)/gim, '<h4 class="text-fs-14 font-semibold text-text-main mt-4 mb-1.5">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 class="text-fs-16 font-bold text-text-main mt-5 mb-2 border-b border-border-main pb-1">$1</h3>')
    .replace(/^# (.*$)/gim, '<h2 class="text-fs-18 font-extrabold text-text-main mt-6 mb-3">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-text-main font-semibold">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-bg-code border border-border-muted px-1.5 py-0.5 rounded text-fs-12 font-mono text-accent-text">$1</code>')
    .replace(/```python([\s\S]*?)```/g, '<pre class="bg-bg-code border border-border-muted rounded-lg p-3 my-3.5 font-mono text-fs-12 text-left overflow-x-auto whitespace-pre"><code class="text-text-main">$1</code></pre>')
    .replace(/```javascript([\s\S]*?)```/g, '<pre class="bg-bg-code border border-border-muted rounded-lg p-3 my-3.5 font-mono text-fs-12 text-left overflow-x-auto whitespace-pre"><code class="text-text-main">$1</code></pre>')
    .replace(/```java([\s\S]*?)```/g, '<pre class="bg-bg-code border border-border-muted rounded-lg p-3 my-3.5 font-mono text-fs-12 text-left overflow-x-auto whitespace-pre"><code class="text-text-main">$1</code></pre>')
    .replace(/```cpp([\s\S]*?)```/g, '<pre class="bg-bg-code border border-border-muted rounded-lg p-3 my-3.5 font-mono text-fs-12 text-left overflow-x-auto whitespace-pre"><code class="text-text-main">$1</code></pre>')
    .replace(/```([\s\S]*?)```/g, '<pre class="bg-bg-code border border-border-muted rounded-lg p-3 my-3.5 font-mono text-fs-12 text-left overflow-x-auto whitespace-pre"><code class="text-text-main">$1</code></pre>')
    .replace(/^\* (.*$)/gim, '<li class="ml-4 list-disc my-1 text-fs-13-5">$1</li>')
    .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc my-1 text-fs-13-5">$1</li>')
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
      return line ? `<p class="my-2 text-fs-13-5 leading-relaxed text-text-hover">${line}</p>` : '';
    })
    .join('');
};

const LANGUAGES = ['Python', 'JavaScript', 'Java', 'C++', 'Go', 'Rust', 'TypeScript'];

// How long the workspace sits still before it writes itself back. Short enough
// that leaving the page never costs you a thought, long enough that a burst of
// typing is one request rather than thirty.
const AUTOSAVE_DELAY_MS = 1200;

const NEW_APPROACH_CODE = '// Add your code solution here';

// Seeded scaffolding isn't work — a problem whose only "solution" is the
// starter comment has not been started.
const isBlankCode = (code) =>
  !code || !code.trim() || code.trim() === NEW_APPROACH_CODE;

// The single definition of "this problem has been worked on", shared by the
// autosave promotion and the checklist so they can never disagree about
// whether a problem is Not started or Solving.
const hasWork = (approaches, notes) =>
  (notes || '').trim().length > 0 ||
  (approaches || []).some(
    (a) => !isBlankCode(a.code) || (a.approach || '').trim() || (a.complexityTime || '').trim() || (a.complexitySpace || '').trim()
  );

// Split-pane bounds, as a percentage of the workspace width.
const SPLIT_MIN = 26;
const SPLIT_MAX = 72;
const SPLIT_DEFAULT = 46;
const SPLIT_STORAGE_KEY = 'dsa_detail_split_pct';

const clampSplit = (pct) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct));

// The stored ratio is read once per mount and written back once per gesture
// (see the persist effect) — not through useLocalStorage, whose write-on-every-
// value effect would hit localStorage synchronously on each drag frame.
const readStoredSplit = () => {
  try {
    const raw = localStorage.getItem(SPLIT_STORAGE_KEY);
    const val = raw === null ? NaN : JSON.parse(raw);
    return Number.isFinite(val) ? clampSplit(val) : SPLIT_DEFAULT;
  } catch {
    return SPLIT_DEFAULT;
  }
};

const StatusDot = ({ className = '', filled = true }) => (
  <svg width="7" height="7" viewBox="0 0 8 8" className={className} aria-hidden="true">
    <circle
      cx="4"
      cy="4"
      r="2.9"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.3"
    />
  </svg>
);

// Replaces the old Save button. Small, monospace, in the header's data voice —
// it should be legible at a glance and invisible the rest of the time.
function SaveStatus({ state, onRetry }) {
  if (state === 'error') {
    return (
      <div className="flex items-center gap-2 font-mono text-fs-11 text-accent-red-text" role="status">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="10" cy="10" r="7.5" />
          <line x1="10" y1="6.2" x2="10" y2="10.8" />
          <line x1="10" y1="13.7" x2="10" y2="13.8" />
        </svg>
        <span>Couldn’t save</span>
        <button
          type="button"
          onClick={onRetry}
          className="font-mono text-fs-11 underline underline-offset-2 bg-transparent border-none text-accent-red-text hover:text-text-main cursor-pointer p-0"
        >
          Retry
        </button>
      </div>
    );
  }

  const variants = {
    clean: { label: 'Autosave on', className: 'text-text-muted', dot: <StatusDot filled={false} /> },
    dirty: { label: 'Unsaved changes', className: 'text-text-muted', dot: <StatusDot filled={false} /> },
    saving: { label: 'Saving…', className: 'text-text-hover', dot: <StatusDot className="text-accent save-pulse" /> },
    saved: {
      label: 'Auto-saved',
      className: 'text-accent-green',
      dot: (
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="17 5.5 8 15 3 10.2" />
        </svg>
      )
    }
  };

  const variant = variants[state] || variants.clean;

  return (
    <div
      role="status"
      aria-live="polite"
      title="Your code, notes and approaches save themselves a moment after you stop typing."
      className={`flex items-center gap-1.5 font-mono text-fs-11 select-none whitespace-nowrap ${variant.className}`}
    >
      {variant.dot}
      {variant.label}
    </div>
  );
}

export default function ProblemDetail({
  problem,
  onBack,
  onUpdateProblem,
  onDeleteProblems,
  onReviseProblems,
  problems = [],
  customLists = [],
  onLoadCustomLists,
  onRefreshProblems
}) {
  // Navigation tabs for left pane: 'description' | 'editorial' | 'checklist'
  const [leftTab, setLeftTab] = useState('description');
  
  // Custom list modal state
  const [isCustomListsModalOpen, setIsCustomListsModalOpen] = useState(false);
  
  // State for approaches & notes
  const [approaches, setApproaches] = useState([]);
  const [activeApproachIdx, setActiveApproachIdx] = useState(0);
  const [notes, setNotes] = useState('');
  
  // UI Spoilers / Hint disclosures
  const [revealedEditorial, setRevealedEditorial] = useState(false);
  const [revealedHints, setRevealedHints] = useState({});
  const [toastMessage, setToastMessage] = useState('');
  
  // State for approach deletion confirmation modal
  const [approachToDeleteIdx, setApproachToDeleteIdx] = useState(null);

  // State for problem deletion confirmation modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Dropdown menu state and ref
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);
  const menuRef = useDismissOnOutside(isMenuOpen, closeMenu);

  // Autosave: 'clean' before anything is touched, then dirty → saving → saved,
  // or 'error' when the write failed and the user's work is only in the tab.
  const [saveState, setSaveState] = useState('clean');

  // Split pane. The user's chosen ratio outlives the session because the right
  // width depends on their monitor, not on the problem.
  const [splitPct, setSplitPct] = useState(readStoredSplit);
  const [isResizing, setIsResizing] = useState(false);
  const splitContainerRef = useRef(null);
  // Drag geometry, read once per gesture; moves are batched to one state
  // update per animation frame so pointermove bursts can't outpace paint.
  // `draggingRef` guards moves synchronously — the isResizing state commits a
  // render later, which would drop a gesture's early moves.
  const draggingRef = useRef(false);
  const dragRectRef = useRef(null);
  const dragFrameRef = useRef(null);
  const dragClientXRef = useRef(0);

  // Persist the ratio when the gesture ends (isResizing flips off) and on
  // keyboard nudges / double-click resets — never per pointermove, where a
  // synchronous localStorage write per event janks the drag itself.
  useEffect(() => {
    if (isResizing) return;
    try {
      localStorage.setItem(SPLIT_STORAGE_KEY, JSON.stringify(splitPct));
    } catch {
      /* private mode / quota — the session still works, the ratio just isn't remembered */
    }
  }, [splitPct, isResizing]);

  // Latest values, mirrored into refs so a flush triggered by unmount, a
  // background tab, or the Back button writes what is on screen right now
  // rather than whatever was current when the timer was scheduled.
  const workspaceRef = useRef({ approaches: [], notes: '' });
  const problemRef = useRef(problem);
  const saveTimerRef = useRef(null);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    workspaceRef.current = { approaches, notes };
  }, [approaches, notes]);

  useEffect(() => {
    problemRef.current = problem;
  }, [problem]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
              code: problem.solution || NEW_APPROACH_CODE,
              lang: 'Python'
            }
          ];

      setApproaches(defaultApproaches);
      setNotes(problem.notes || '');
      setActiveApproachIdx(0);
      setRevealedEditorial(false);
      setRevealedHints({});
      setSaveState('clean');
      // A failed override belongs to the problem it was made on — never let
      // one leak into the next problem's payload.
      pendingOverridesRef.current = {};
    }
    // Re-initialize only when switching to a different problem. Depending on
    // `problem` itself would clobber in-progress edits (and re-hide spoilers)
    // every time a save produces a new problem object with the same id.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [problem?.id]);

  // Deliberate changes (status, checklist) that haven't reached the server
  // yet. They must survive a failed write: the Retry button, the unload
  // flushes, and the next autosave all call persist() bare, and without this
  // a failed "Mark complete" would be silently rewritten with the old status.
  const pendingOverridesRef = useRef({});

  // Write the workspace back. `overrides` carries deliberate changes (status,
  // checklist) that must win over what the current problem row says.
  // `keepalive` marks writes flushed while the page is going away.
  const persist = useCallback(
    async (overrides = {}, { keepalive = false } = {}) => {
      const current = problemRef.current;
      if (!current) return false;

      pendingOverridesRef.current = { ...pendingOverridesRef.current, ...overrides };

      const { approaches: liveApproaches, notes: liveNotes } = workspaceRef.current;
      const primary = liveApproaches[0] || {};

      // First real edit on an untouched problem is the moment it becomes
      // "Solving" — the state you'd otherwise have to go and set by hand.
      const started =
        current.status === 'Not started' && hasWork(liveApproaches, liveNotes)
          ? 'Solving'
          : current.status;

      const payload = {
        ...current,
        status: started,
        approach: primary.approach || '',
        solution: primary.code || '',
        notes: liveNotes,
        approaches: liveApproaches,
        ...pendingOverridesRef.current
      };

      pendingRef.current = false;
      if (mountedRef.current) setSaveState('saving');
      try {
        await onUpdateProblem(payload, { keepalive });
        pendingOverridesRef.current = {};
        // Edits typed while this write was in flight are still unsaved — the
        // re-armed debounce will follow up, so don't claim "saved" over them.
        if (mountedRef.current) setSaveState(pendingRef.current ? 'dirty' : 'saved');
        return true;
      } catch {
        // Keep it dirty: the retry affordance and the next edit both re-arm.
        pendingRef.current = true;
        if (mountedRef.current) setSaveState('error');
        return false;
      }
    },
    [onUpdateProblem]
  );

  // Every edit path funnels through here, so there is exactly one place that
  // decides when a write happens.
  const markDirty = useCallback(() => {
    pendingRef.current = true;
    setSaveState('dirty');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void persist();
    }, AUTOSAVE_DELAY_MS);
  }, [persist]);

  // Write immediately instead of waiting out the debounce.
  const flushNow = useCallback((opts = {}) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!pendingRef.current) return;
    void persist({}, opts);
  }, [persist]);

  // Leaving the tab, hiding the window, or unmounting all cut the debounce
  // short so a pending edit can never be the thing that gets lost. Exit
  // flushes use keepalive so the browser doesn't abort the write with the
  // document (a plain fetch dies on tab close).
  useEffect(() => {
    const flushOnExit = () => flushNow({ keepalive: true });
    const handleHide = () => {
      if (document.visibilityState === 'hidden') flushOnExit();
    };
    document.addEventListener('visibilitychange', handleHide);
    window.addEventListener('pagehide', flushOnExit);
    return () => {
      document.removeEventListener('visibilitychange', handleHide);
      window.removeEventListener('pagehide', flushOnExit);
    };
  }, [flushNow]);

  // Unmount is the last chance to write, so it must fire on unmount and
  // nothing else. `persist` is rebuilt whenever App hands down a new
  // onUpdateProblem (every save does), so depending on it here would run this
  // teardown mid-life and defeat the debounce — read it through a ref and keep
  // the dependency list empty.
  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (pendingRef.current) void persistRef.current();
    },
    []
  );

  // Drag the seam between the statement and the editor.
  const applyDragPosition = () => {
    const rect = dragRectRef.current;
    if (!rect || !rect.width) return;
    const pct = ((dragClientXRef.current - rect.left) / rect.width) * 100;
    setSplitPct(clampSplit(Math.round(pct * 10) / 10));
  };

  const handleResizeStart = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    // One layout read per gesture — the pane's geometry can't change mid-drag,
    // so measuring on every move would only force needless reflows.
    dragRectRef.current = splitContainerRef.current?.getBoundingClientRect() ?? null;
    draggingRef.current = true;
    setIsResizing(true);
  };

  const handleResizeMove = (e) => {
    if (!draggingRef.current) return;
    dragClientXRef.current = e.clientX;
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      applyDragPosition();
    });
  };

  // Ends the gesture from any exit: pointerup on the handle (pointer capture
  // routes it here even off-element), or the window-level fallbacks below.
  // A frame still pending is applied, not discarded — otherwise the last
  // sliver of movement (or an entire fast gesture) would be lost.
  const handleResizeEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
      applyDragPosition();
    }
    setIsResizing(false);
  };

  // Release is watched on the window, not the handle: if pointer capture is
  // lost or the button comes up off the element, the handle must still drop
  // out of its dragging state rather than staying lit.
  useEffect(() => {
    if (!isResizing) return undefined;
    window.addEventListener('pointerup', handleResizeEnd);
    window.addEventListener('pointercancel', handleResizeEnd);
    window.addEventListener('blur', handleResizeEnd);
    return () => {
      window.removeEventListener('pointerup', handleResizeEnd);
      window.removeEventListener('pointercancel', handleResizeEnd);
      window.removeEventListener('blur', handleResizeEnd);
      // Unmount mid-drag: nothing left to update, just drop the frame.
      if (dragFrameRef.current !== null) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
    };
    // handleResizeEnd only touches refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isResizing]);

  const nudgeSplit = (delta) => setSplitPct((p) => clampSplit(p + delta));

  // The editorial article is a heavy regex pass over a long document; every
  // keystroke in the workspace re-renders this component, so formatting must
  // be cached per article, not re-run per render.
  const editorialHtml = useMemo(
    () => (problem?.solutionContent ? formatMarkdown(problem.solutionContent) : ''),
    [problem?.solutionContent]
  );

  if (!problem) {
    return (
      <div className="p-10 flex flex-col items-center gap-4 text-center">
        <div className="text-text-muted">
          Problem not found — it may have been deleted.
        </div>
        <Button variant="secondary" onClick={onBack}>
          ← Back to problem bank
        </Button>
      </div>
    );
  }

  // Handle local text inputs
  const handleUpdateApproachField = (field, value) => {
    setApproaches((prev) =>
      prev.map((appr, idx) => (idx === activeApproachIdx ? { ...appr, [field]: value } : appr))
    );
    markDirty();
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
      code: NEW_APPROACH_CODE,
      lang: 'Python'
    };
    setApproaches((prev) => [...prev, newApproach]);
    setActiveApproachIdx(approaches.length);
    markDirty();
  };

  // Delete an approach variation
  const handleDeleteApproach = (indexToDelete, e) => {
    e.stopPropagation();
    if (approaches.length <= 1) return;
    setApproachToDeleteIdx(indexToDelete);
  };

  const handleConfirmDeleteApproach = () => {
    if (approachToDeleteIdx === null) return;
    const updated = approaches.filter((_, idx) => idx !== approachToDeleteIdx);
    setApproaches(updated);
    setActiveApproachIdx((prev) => (prev >= updated.length ? updated.length - 1 : prev));
    setApproachToDeleteIdx(null);
    markDirty();
  };

  const handleUpdateNotes = (value) => {
    setNotes(value);
    markDirty();
  };

  // Horizontal scroll for approaches tab bar on mouse wheel scroll
  const handleTabsWheel = (e) => {
    if (e.deltaY === 0) return;
    e.preventDefault();
    e.currentTarget.scrollLeft += e.deltaY;
  };

  // Save any pending edit before the workspace unmounts, so the trip back to
  // the bank is never the thing that costs you a keystroke.
  const handleBack = () => {
    flushNow();
    onBack();
  };

  const isDone = problem.status === 'Done';

  // Done ⇄ Solving. Reopening lands on Solving rather than Not started — the
  // work is still there, so claiming otherwise would be a lie. The toast only
  // fires on a confirmed write: on failure SaveStatus already shows
  // "Couldn't save" with Retry, and the override is held for that retry.
  const handleToggleComplete = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const ok = isDone
      ? await persist({ status: 'Solving' })
      : await persist({
          status: 'Done',
          due: false,
          lastRevised: 'just now',
          nextLabel: 'in 6 days',
          revisions: (problem.revisions || 0) + 1
        });
    if (!ok) return;

    setToastMessage(isDone ? 'Reopened — back to solving.' : 'Problem completed!');
    setTimeout(() => setToastMessage(''), 2500);
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDeleteProblem = () => {
    setShowDeleteConfirm(false);
    onDeleteProblems([problem.id]);
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

  // Without stored progress, only "Done" can be inferred — a Solving problem
  // used to be shown with four steps pre-ticked, which invented progress the
  // user never made.
  const defaultDoneCount = problem.status === 'Done' ? checklistLabels.length : 0;

  const checklistProgress = problem.checklistProgress
    ? checklistLabels.map((_, idx) => !!problem.checklistProgress[idx])
    : checklistLabels.map((_, idx) => idx < defaultDoneCount);

  // The "current" step is the first unchecked one.
  const currentStepIdx = checklistProgress.findIndex((done) => !done);

  const checklistItems = checklistLabels.map((label, idx) => {
    const isDone = checklistProgress[idx];

    return {
      label,
      done: isDone,
      current: idx === currentStepIdx,
      color: isDone ? 'var(--color-text-hover)' : (idx === currentStepIdx ? 'var(--color-text-main)' : 'var(--color-text-muted)'),
      strike: isDone
    };
  });

  const handleToggleStep = (stepIndex) => {
    const currentProgress = [...checklistProgress];

    currentProgress[stepIndex] = !currentProgress[stepIndex];

    let newStatus;
    let isDue = problem.due;

    const checkedCount = currentProgress.filter(Boolean).length;
    if (currentProgress[checklistLabels.length - 1]) {
      newStatus = 'Done';
      isDue = false;
    } else if (checkedCount > 0 || hasWork(approaches, notes)) {
      // Written code counts even with every box cleared — unticking the
      // checklist shouldn't erase the fact that the problem was worked on.
      newStatus = 'Solving';
    } else {
      newStatus = 'Not started';
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void persist({ status: newStatus, due: isDue, checklistProgress: currentProgress });
  };

  const activeApproach = approaches[activeApproachIdx] || {};

  return (
    <div className="w-full h-full flex flex-col bg-bg-panel-dark text-text-code overflow-hidden select-none">
      
      {/* Workspace Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-bg-card border-b border-border-main shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={handleBack}
            className="flex items-center justify-center p-1.5 rounded bg-bg-element-dark hover:bg-bg-element-hover border border-border-muted text-text-muted hover:text-text-main transition-colors cursor-pointer"
            title="Back to Problems"
          >
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="10" x2="1" y2="10" />
              <polyline points="10 19 1 10 10 1" />
            </svg>
          </button>

          <div className="flex items-center gap-3 truncate">
            <span
              onClick={handleBack}
              className="font-mono text-fs-12 text-text-muted hover:text-text-main cursor-pointer transition-colors"
            >
              {problem.topic}
            </span>
            <span className="text-border-btn">/</span>
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
              className="flex items-center gap-1.5 text-fs-12 font-semibold text-[#FFA116] border border-[#FFA116]/30 bg-[#FFA116]/8 hover:bg-[#FFA116]/18 hover:border-[#FFA116]/55 px-3 py-1.5 rounded-card-btn transition-all"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                <path d="M13.483 0a1.374 1.374 0 0 0-.961.438L7.116 6.226l-3.854 4.126a5.266 5.266 0 0 0-1.209 2.104 5.35 5.35 0 0 0-.125.513 5.527 5.527 0 0 0 .062 2.362 5.83 5.83 0 0 0 .349 1.017 5.938 5.938 0 0 0 1.271 1.818l4.277 4.193.039.038c2.248 2.165 5.852 2.133 8.063-.074l2.396-2.392c.54-.54.54-1.414.003-1.955a1.378 1.378 0 0 0-1.951-.003l-2.396 2.392a3.021 3.021 0 0 1-4.205.038l-.02-.019-4.276-4.193c-.652-.64-.972-1.469-.948-2.263a2.68 2.68 0 0 1 .066-.523 2.545 2.545 0 0 1 .619-1.164L9.13 8.114c1.058-1.134 3.204-1.27 4.43-.278l3.501 2.831c.593.48 1.461.387 1.94-.207a1.384 1.384 0 0 0-.207-1.943l-3.5-2.831c-.8-.647-1.766-1.045-2.774-1.202l2.015-2.158A1.384 1.384 0 0 0 13.483 0zm-2.866 12.815a1.38 1.38 0 0 0-1.38 1.382 1.38 1.38 0 0 0 1.38 1.382H20.79a1.38 1.38 0 0 0 1.38-1.382 1.38 1.38 0 0 0-1.38-1.382z"/>
              </svg>
              LeetCode ↗
            </a>
          )}
          <SaveStatus state={saveState} onRetry={() => void persist()} />

          <Button
            onClick={handleToggleComplete}
            variant={isDone ? 'secondary' : 'primary'}
            className="cursor-pointer"
            title={isDone ? 'Reopen this problem' : 'Mark this problem complete'}
          >
            {isDone && (
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 5 8 15 3 10" />
              </svg>
            )}
            {isDone ? 'Completed' : 'Mark complete'}
          </Button>

          {/* Three dot actions menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              className="flex items-center justify-center p-2.5 dropdown-trigger-3d text-text-muted hover:text-text-main cursor-pointer"
              title="More Actions"
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
                <circle cx="10" cy="4" r="2.2" />
                <circle cx="10" cy="10" r="2.2" />
                <circle cx="10" cy="16" r="2.2" />
              </svg>
            </button>
            
            {isMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-40 dropdown-menu-3d z-50 overflow-hidden">
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsCustomListsModalOpen(true);
                  }}
                  className="w-full text-left px-4 py-2.5 text-fs-13 text-text-hover hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-2 border-none bg-transparent"
                >
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3.5" y1="6" x2="16.5" y2="6"/>
                    <line x1="3.5" y1="10" x2="16.5" y2="10"/>
                    <line x1="3.5" y1="14" x2="11.5" y2="14"/>
                    <path d="M14.5 13v4M16.5 15h-4"/>
                  </svg>
                  Add to List
                </button>
                <div className="border-t border-border-muted my-1"></div>
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    if (onReviseProblems) onReviseProblems([problem]);
                  }}
                  className="w-full text-left px-4 py-2.5 text-fs-13 text-text-hover hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-2 border-none bg-transparent"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                  </svg>
                  Force Revision
                </button>
                <div className="border-t border-border-muted my-1"></div>
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleDelete();
                  }}
                  className="w-full text-left px-4 py-2.5 text-fs-13 text-accent-red-text hover:bg-badge-hard-bg font-bold transition-colors cursor-pointer flex items-center gap-2 border-none bg-transparent"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                  Delete Problem
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Split Pane Container */}
      <div
        ref={splitContainerRef}
        className={`flex-1 w-full flex overflow-hidden min-h-0 relative ${isResizing ? 'cursor-col-resize' : ''}`}
      >

        {/* Toast Notification */}
        {toastMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-bg-card border border-accent-green/30 text-accent-green text-fs-12 font-medium px-4 py-2.5 rounded-lg shadow-modal flex items-center gap-2 animate-fade-in">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {toastMessage}
          </div>
        )}

        {/* LEFT PANE (Problem Details) */}
        <div
          style={{ flexBasis: `${splitPct}%` }}
          className="h-full flex-none grow-0 shrink flex flex-col bg-bg-card min-w-[300px]"
        >
          {/* Tab bar */}
          <div className="flex bg-bg-main border-b border-border-muted shrink-0 text-fs-11 font-mono tracking-wider text-text-muted">
            <button
              onClick={() => setLeftTab('description')}
              className={`px-5 py-3 border-r border-border-muted cursor-pointer transition-colors ${
                leftTab === 'description'
                  ? 'bg-bg-card text-text-main border-b-2 border-b-accent'
                  : 'hover:bg-bg-element-hover hover:text-text-main'
              }`}
            >
              DESCRIPTION
            </button>
            <button
              onClick={() => setLeftTab('editorial')}
              className={`px-5 py-3 border-r border-border-muted cursor-pointer transition-colors ${
                leftTab === 'editorial'
                  ? 'bg-bg-card text-text-main border-b-2 border-b-accent'
                  : 'hover:bg-bg-element-hover hover:text-text-main'
              }`}
            >
              EDITORIAL
            </button>
            <button
              onClick={() => setLeftTab('checklist')}
              className={`px-5 py-3 cursor-pointer transition-colors ${
                leftTab === 'checklist'
                  ? 'bg-bg-card text-text-main border-b-2 border-b-accent'
                  : 'hover:bg-bg-element-hover hover:text-text-main'
              }`}
            >
              CHECKLIST & NOTES
            </button>
          </div>

          {/* Left Tab Content (Scrollable). overflow-x is clamped here: long
              example lines wrap, and the rare unbreakable block scrolls inside
              its own frame rather than dragging the whole panel sideways. */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 custom-scrollbar text-left text-fs-13-5 leading-relaxed">

            {/* Description Tab — reading order follows a problem page: title,
                what kind of problem it is, the statement, then the numbers.
                Deliberately uncapped: the statement fills whatever width the
                divider gives it, so dragging the seam actually reflows the
                text instead of growing a margin beside it. The divider is the
                reading-measure control. */}
            {leftTab === 'description' && (
              <div className="flex flex-col gap-5 select-text">
                <div className="flex flex-col gap-3">
                  <h1 className="text-fs-20 font-bold text-text-main leading-snug">
                    {problem.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
                    <Badge type="difficulty" value={problem.difficulty} />
                    <Badge type="status" value={problem.status} />
                    {problem.topic && (
                      <span className="font-mono text-fs-10 text-text-muted bg-white/4 px-2 py-0.5 rounded">
                        {problem.topic}
                      </span>
                    )}
                    {problem.patterns && problem.patterns.map((pat, idx) => (
                      <span
                        key={idx}
                        className="font-mono text-fs-10 text-accent-text bg-accent/5 border border-accent/15 px-2 py-0.5 rounded"
                      >
                        {pat}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Problem Statement */}
                <div
                  className="leetcode-statement"
                  dangerouslySetInnerHTML={{
                    __html: problem.statement || '<p class="text-text-muted">No description available.</p>'
                  }}
                />

                {/* Example inputs/outputs — only for hand-entered problems;
                    imported statements carry their own example blocks. */}
                {(problem.exIn || problem.exOut) && (
                  <div className="bg-bg-code border border-border-muted rounded-lg p-4 font-mono text-fs-12 text-text-code whitespace-pre-wrap break-words">
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

                {/* Catalog numbers — present, but not competing with the
                    statement for the top of the page. */}
                {((problem.stats && Object.keys(problem.stats).length > 0) || problem.likes > 0 || problem.dislikes > 0) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3.5 border-t border-border-muted font-mono text-fs-11 text-text-muted select-none">
                    {problem.stats?.acRate && (
                      <span className="flex items-center gap-1.5" title="Acceptance rate">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                          <circle cx="12" cy="12" r="10" />
                          <circle cx="12" cy="12" r="6" />
                          <circle cx="12" cy="12" r="2" />
                        </svg>
                        <span className="text-text-hover">{problem.stats.acRate} accepted</span>
                      </span>
                    )}
                    {problem.stats?.totalAccepted && (
                      <span className="flex items-center gap-1.5" title="Accepted submissions">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent-green">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {problem.stats.totalAccepted}
                      </span>
                    )}
                    {problem.stats?.totalSubmission && (
                      <span className="flex items-center gap-1.5" title="Total submissions">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                        {problem.stats.totalSubmission}
                      </span>
                    )}
                    {problem.likes > 0 && (
                      <span className="flex items-center gap-1.5" title="Likes">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent-green">
                          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                        </svg>
                        {problem.likes.toLocaleString()}
                      </span>
                    )}
                    {problem.dislikes > 0 && (
                      <span className="flex items-center gap-1.5" title="Dislikes">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent-red-text">
                          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
                        </svg>
                        {problem.dislikes.toLocaleString()}
                      </span>
                    )}
                  </div>
                )}

                {/* Expandable Hints */}
                {problem.hints && problem.hints.length > 0 && (
                  <div>
                    <div className="font-mono text-[10px] text-text-muted tracking-[0.05em] mb-2.5">
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
                              className="px-3.5 py-2.5 cursor-pointer bg-white/2 hover:bg-white/3 flex items-center justify-between text-fs-12 text-text-main select-none transition-colors"
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



                {/* Similar Questions */}
                {problem.similarQuestions && problem.similarQuestions.length > 0 && (
                  <div>
                    <div className="font-mono text-[10px] text-text-muted tracking-[0.05em] mb-2.5">
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
                            className="text-accent-text hover:underline text-fs-11 font-mono shrink-0"
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
                      <span className="font-semibold text-fs-13 text-accent-text font-mono">
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
                      className="leetcode-solution text-fs-13-5 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: editorialHtml }}
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
                    onChange={(e) => handleUpdateNotes(e.target.value)}
                    rows={12}
                    placeholder="Write your learnings, core concepts, or pitfalls here. These notes are shared across all approaches."
                    className="bg-bg-code border border-border-main rounded-xl p-4 text-text-main font-sans text-fs-13-5 leading-[1.6] outline-none w-full focus:border-accent transition-colors resize-y select-text"
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
                    <span className={problem.due ? 'text-accent-text font-semibold' : 'text-text-hover'}>
                      {problem.due ? 'TODAY' : problem.nextLabel}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Drag the seam to give either side more room. Double-click resets;
            arrow keys nudge it once focused. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the problem panel"
          aria-valuenow={Math.round(splitPct)}
          aria-valuemin={SPLIT_MIN}
          aria-valuemax={SPLIT_MAX}
          tabIndex={0}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
          onDoubleClick={() => setSplitPct(SPLIT_DEFAULT)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeSplit(-2); }
            if (e.key === 'ArrowRight') { e.preventDefault(); nudgeSplit(2); }
          }}
          title="Drag to resize · double-click to reset"
          className={`group relative w-[7px] shrink-0 cursor-col-resize touch-none flex items-center justify-center outline-none ${
            isResizing ? 'bg-accent/12' : 'hover:bg-accent/8 focus-visible:bg-accent/12'
          }`}
        >
          <span
            className={`w-px h-full transition-colors duration-150 ${
              isResizing
                ? 'bg-accent'
                : 'bg-border-main group-hover:bg-accent/60 group-focus-visible:bg-accent'
            }`}
          />
        </div>

        {/* RIGHT PANE (Code Playground) */}
        <div className="flex-1 h-full flex flex-col bg-bg-panel-dark min-w-0 overflow-hidden">
          
          {/* Approaches tabs */}
          <div className="bg-bg-main border-b border-border-muted px-4 shrink-0 text-fs-11 font-mono">
            <div 
              onWheel={handleTabsWheel}
              className="flex items-center gap-0.5 overflow-x-auto no-scrollbar select-none w-full"
            >
              {approaches.map((appr, idx) => (
                <div
                  key={appr.id}
                  onClick={() => setActiveApproachIdx(idx)}
                  className={`flex items-center gap-2 px-4 py-3 border-r border-border-muted cursor-pointer transition-colors relative ${
                    activeApproachIdx === idx
                      ? 'bg-bg-panel-dark text-text-main border-b-2 border-b-accent font-semibold'
                      : 'hover:bg-bg-element-hover hover:text-text-hover'
                  }`}
                >
                  <span className="max-w-[120px] truncate">{appr.name}</span>
                  
                  {approaches.length > 1 && (
                    <button
                      onClick={(e) => handleDeleteApproach(idx, e)}
                      className="text-text-muted hover:text-accent-red-text p-0.5 rounded hover:bg-white/5 transition-colors cursor-pointer bg-transparent border-none"
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
                className="px-4 py-3 text-accent-text hover:text-text-main hover:bg-bg-element-hover transition-colors font-mono cursor-pointer bg-transparent border-none border-r border-border-muted"
                title="Add new approach variation"
              >
                + ADD APPROACH
              </button>
            </div>
          </div>

          {/* Active approach panel */}
          {activeApproach && (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              
              {/* Approach settings bar */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1.1fr] gap-3 px-6 py-3.5 bg-bg-card border-b border-border-main shrink-0 items-center">
                {/* Name */}
                <div className="flex flex-col gap-1 text-left">
                  <label className="font-mono text-[9px] text-text-muted tracking-[0.05em] uppercase">Approach Name</label>
                  <input
                    type="text"
                    value={activeApproach.name || ''}
                    onChange={(e) => handleUpdateApproachField('name', e.target.value)}
                    placeholder="e.g. Optimal (Two Pointers)"
                    className="bg-bg-code border border-border-main rounded-md px-2.5 py-1 text-text-main text-fs-12-5 outline-none focus:border-accent transition-colors w-full"
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
                    className="bg-bg-code border border-border-main rounded-md px-2.5 py-1 text-text-main text-fs-12-5 outline-none focus:border-accent transition-colors w-full font-mono"
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
                    className="bg-bg-code border border-border-main rounded-md px-2.5 py-1 text-text-main text-fs-12-5 outline-none focus:border-accent transition-colors w-full font-mono"
                  />
                </div>

                {/* Language select */}
                <div className="flex flex-col gap-1 text-left">
                  <label className="font-mono text-[9px] text-text-muted tracking-[0.05em] uppercase">Language</label>
                  <select
                    value={activeApproach.lang || 'Python'}
                    onChange={(e) => handleUpdateApproachField('lang', e.target.value)}
                    className="bg-bg-code border border-border-main rounded-md px-2 py-1 text-text-main text-fs-12-5 outline-none focus:border-accent cursor-pointer transition-colors w-full"
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
              <div className="px-6 py-2.5 bg-bg-card/40 border-b border-border-main shrink-0 flex flex-col gap-1 text-left">
                <label className="font-mono text-[9px] text-text-muted tracking-[0.05em] uppercase">Approach Logic / Strategy Explanation</label>
                <textarea
                  value={activeApproach.approach || ''}
                  onChange={(e) => handleUpdateApproachField('approach', e.target.value)}
                  rows={2}
                  placeholder="Explain the strategy, data structures used, or recursive relations..."
                  className="bg-bg-code border border-border-main rounded-md px-3 py-2 text-text-main font-sans text-fs-12-5 outline-none focus:border-accent transition-colors resize-none select-text"
                />
              </div>

              {/* Code Playground area (Scrollable code block) */}
              <div className="flex-1 overflow-hidden min-h-0 bg-bg-card select-text">
                <CodeEditor
                  value={activeApproach.code || ''}
                  onChange={(val) => handleUpdateApproachField('code', val)}
                  language={activeApproach.lang || 'Python'}
                  placeholder="// Type your solution here..."
                  height="100%"
                  className="h-full text-[11.5px]"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={approachToDeleteIdx !== null}
        title="Delete Approach"
        message={
          <span>
            Are you sure you want to delete{' '}
            <strong className="text-text-main">
              {approachToDeleteIdx !== null ? approaches[approachToDeleteIdx]?.name : ''}
            </strong>
            ? This action cannot be undone.
          </span>
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDeleteApproach}
        onCancel={() => setApproachToDeleteIdx(null)}
        confirmVariant="red"
      />

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Delete Problem"
        message={
          <span>
            Are you sure you want to delete{' '}
            <strong className="text-text-main">
              {problem.title}
            </strong>
            ? This action cannot be undone.
          </span>
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDeleteProblem}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmVariant="red"
      />

      <CustomListsModal
        isOpen={isCustomListsModalOpen}
        target={problem}
        problems={problems}
        customLists={customLists}
        onClose={() => setIsCustomListsModalOpen(false)}
        onLoadCustomLists={onLoadCustomLists}
        onRefreshProblems={onRefreshProblems}
      />
    </div>
  );
}
