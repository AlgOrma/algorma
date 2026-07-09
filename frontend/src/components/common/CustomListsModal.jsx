import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as api from '../../api';
import Button from './Button';

function CustomCheckbox({ checked, indeterminate }) {
  return (
    <div className="w-[18px] h-[18px] flex items-center justify-center shrink-0">
      {checked || indeterminate ? (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <rect x="2" y="2" width="16" height="16" rx="4" fill="var(--color-accent)" />
          {checked && !indeterminate && (
            <path d="M6 10l3 3 5-5" stroke="var(--color-text-dark)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {indeterminate && (
            <line x1="5" y1="10" x2="15" y2="10" stroke="var(--color-text-dark)" strokeWidth="2.5" strokeLinecap="round" />
          )}
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" className="text-text-muted group-hover/row:text-text-hover transition-colors duration-150">
          <rect x="2" y="2" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="2" />
        </svg>
      )}
    </div>
  );
}

export default function CustomListsModal({
  isOpen,
  target, // LeetCodeQuestion, Problem, or Array of problem IDs
  problems = [],
  customLists = [],
  onClose,
  onSaveProblem,
  onLoadCustomLists,
  onRefreshProblems
}) {
  const [newListName, setNewListName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateInline, setShowCreateInline] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Local state for optimistic checkbox updates — this is the ONLY source of
  // truth for checkbox state while the modal is open.  We never refresh parent
  // data mid-session; instead we sync once on close.
  const [memberships, setMemberships] = useState({});

  // Track whether we made any changes so we know to refresh on close.
  const hasPendingChangesRef = useRef(false);

  // Resolve target problems — always look up from the `problems` array so we
  // get the latest customListIds (important for initial membership calc).
  const resolvedTarget = React.useMemo(() => {
    if (!target) {
      return { targetProblems: [], isLeetCodeImportMode: false, leetcodeQuestion: null };
    }

    let targetProblems = [];
    let isLeetCodeImportMode = false;
    let leetcodeQuestion = null;

    if (Array.isArray(target)) {
      // Array of problem IDs (Bulk Action Mode)
      targetProblems = problems.filter((p) => target.includes(p.id));
    } else if (target.leetcodeUrl || target.leetcode_url) {
      if ('status' in target) {
        // Personal Problem object — look up from fresh problems array
        const found = problems.find((p) => p.id === target.id);
        targetProblems = [found || target];
      } else {
        // Reference LeetCode question (not yet imported)
        isLeetCodeImportMode = true;
        leetcodeQuestion = target;
        const found = problems.find(
          (p) => p.leetcodeId === target.id || p.leetcodeUrl === target.leetcodeUrl
        );
        if (found) {
          targetProblems = [found];
        }
      }
    } else {
      // Fallback: single Problem ID or object
      const targetId = typeof target === 'string' ? target : target.id;
      const found = problems.find((p) => p.id === targetId);
      if (found) {
        targetProblems = [found];
      }
    }

    return { targetProblems, isLeetCodeImportMode, leetcodeQuestion };
  }, [target, problems]);

  const { targetProblems, isLeetCodeImportMode, leetcodeQuestion } = resolvedTarget;

  // Compute initial memberships ONCE when the modal opens or target changes.
  // We intentionally do NOT re-derive from refreshed data mid-session — the
  // optimistic `memberships` state is the single source of truth while open.
  useEffect(() => {
    if (!isOpen) return;

    const initial = {};
    customLists.forEach((list) => {
      let countInList = 0;
      if (targetProblems.length > 0) {
        countInList = targetProblems.filter((p) => p.customListIds?.includes(list.id)).length;
      }
      initial[list.id] = {
        checked: countInList === targetProblems.length && targetProblems.length > 0,
        indeterminate: countInList > 0 && countInList < targetProblems.length
      };
    });
    setMemberships(initial);
    hasPendingChangesRef.current = false;
    // Only run when the modal opens or the target changes — NOT when
    // customLists/problems refresh during the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, target]);

  // When a new list is created inline, it appears in `customLists` but won't
  // be in `memberships` yet.  Add it as unchecked.
  useEffect(() => {
    if (!isOpen) return;
    setMemberships((prev) => {
      const updated = { ...prev };
      let changed = false;
      customLists.forEach((list) => {
        if (!(list.id in updated)) {
          updated[list.id] = { checked: false, indeterminate: false };
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, [customLists, isOpen]);

  // Clear error after a delay
  useEffect(() => {
    if (!errorMessage) return;
    const timer = setTimeout(() => setErrorMessage(''), 4000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Reset form state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowCreateInline(false);
      setNewListName('');
      setErrorMessage('');
    }
  }, [isOpen]);

  // Wrap onClose to sync parent state when the modal is dismissed.
  const handleClose = useCallback(() => {
    if (hasPendingChangesRef.current) {
      if (onLoadCustomLists) onLoadCustomLists();
      if (onRefreshProblems) onRefreshProblems();
    }
    onClose();
  }, [onClose, onLoadCustomLists, onRefreshProblems]);

  const handleToggle = useCallback(async (listId, isChecked) => {
    // Clear any previous error
    setErrorMessage('');

    // Optimistic update — instantly flip the checkbox
    setMemberships((prev) => ({
      ...prev,
      [listId]: { checked: isChecked, indeterminate: false }
    }));

    try {
      if (isLeetCodeImportMode && targetProblems.length === 0) {
        // Case A: Reference question not yet imported — import first
        const newProblem = await api.importLeetCodeQuestion(leetcodeQuestion.id);
        if (onSaveProblem) onSaveProblem(newProblem);
        await api.addProblemsToCustomList(listId, [newProblem.id]);
      } else {
        // Case B & C: Already-imported personal problem(s)
        const problemIds = targetProblems.map((p) => p.id);
        if (isChecked) {
          await api.addProblemsToCustomList(listId, problemIds);
        } else {
          await Promise.all(
            problemIds.map((pId) => api.removeProblemFromCustomList(listId, pId))
          );
        }
      }

      // Mark that we have pending changes to sync on close
      hasPendingChangesRef.current = true;
    } catch (err) {
      // Revert the optimistic update on failure
      setMemberships((prev) => ({
        ...prev,
        [listId]: { checked: !isChecked, indeterminate: false }
      }));
      setErrorMessage(err.message || 'Operation failed');
    }
  }, [isLeetCodeImportMode, targetProblems, leetcodeQuestion, onSaveProblem]);

  const handleCreateList = async (e) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    setIsCreating(true);
    setErrorMessage('');
    try {
      await api.createCustomList({ name: newListName.trim() });
      setNewListName('');
      setShowCreateInline(false);
      hasPendingChangesRef.current = true;
      // Refresh lists so the new list appears in the checklist
      if (onLoadCustomLists) await onLoadCustomLists();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to create list');
    } finally {
      setIsCreating(false);
    }
  };

  const getSubtitle = () => {
    if (Array.isArray(target)) {
      return `${target.length} ${target.length === 1 ? 'problem' : 'problems'} selected`;
    }
    if (isLeetCodeImportMode && leetcodeQuestion) {
      return leetcodeQuestion.title;
    }
    if (targetProblems.length === 1) {
      return targetProblems[0].title;
    }
    return null;
  };

  if (!isOpen || !target) return null;

  const subtitle = getSubtitle();

  return (
    <div
      className="fixed inset-0 bg-bg-overlay/80 backdrop-blur-[4px] flex items-center justify-center z-[2000] p-5 animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-[360px] bg-bg-main border border-border-main rounded-xl shadow-modal flex flex-col text-left overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-border-subtle flex flex-col gap-0.5">
          <div className="flex items-center justify-between">
            <span className="text-fs-12 font-bold text-text-main font-mono tracking-widest uppercase">
              Add to list
            </span>
            <div className="flex items-center gap-3 shrink-0">
              {!showCreateInline && (
                <button
                  type="button"
                  onClick={() => setShowCreateInline(true)}
                  className="bg-transparent border-none text-accent hover:text-white font-mono text-[10px] font-bold tracking-wider cursor-pointer transition-colors px-1 py-0.5"
                >
                  + NEW
                </button>
              )}
              <button
                onClick={handleClose}
                className="bg-transparent border-none text-text-muted text-fs-14 cursor-pointer leading-none hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
          {subtitle && (
            <span className="text-fs-11 text-text-muted font-mono truncate leading-snug mt-0.5">
              {subtitle}
            </span>
          )}
        </div>

        {/* Inline Create Form */}
        {showCreateInline && (
          <form
            onSubmit={handleCreateList}
            className="px-5 py-3 bg-bg-element-dark border-b border-border-subtle flex gap-2 items-center"
          >
            <input
              type="text"
              placeholder="List name..."
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              disabled={isCreating}
              autoFocus
              className="flex-1 text-fs-11 text-text-main bg-bg-card border border-border-main rounded px-2.5 py-1.5 outline-none focus:border-accent disabled:opacity-50"
            />
            <Button
              type="submit"
              size="sm"
              disabled={isCreating || !newListName.trim()}
              style={{ padding: '0 10px', height: '26px', fontSize: '10px' }}
            >
              {isCreating ? '...' : 'Create'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setShowCreateInline(false);
                setNewListName('');
              }}
              className="text-text-muted hover:text-white font-mono text-[10px] bg-transparent border-none cursor-pointer px-1 py-0.5"
            >
              ✕
            </button>
          </form>
        )}

        {/* Inline Error Banner */}
        {errorMessage && (
          <div className="px-5 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-fs-11 font-mono flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <circle cx="10" cy="10" r="8" />
              <line x1="10" y1="6.5" x2="10" y2="10.5" />
              <circle cx="10" cy="13.5" r="0.8" fill="currentColor" stroke="none" />
            </svg>
            <span className="truncate">{errorMessage}</span>
          </div>
        )}

        {/* Custom Lists Checklist */}
        <div className="px-2 py-3 flex flex-col max-h-[280px] overflow-y-auto custom-scrollbar">
          {customLists.length === 0 ? (
            <div className="flex flex-col items-center gap-2.5 py-6 px-3">
              <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted/40">
                <path d="M2 13.5V4a1.5 1.5 0 0 1 1.5-1.5h4.5a1.5 1.5 0 0 1 1.25.75L10.5 5h6A1.5 1.5 0 0 1 18 6.5v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 2 13.5z"/>
                <line x1="8" y1="10" x2="12" y2="10"/>
                <line x1="10" y1="8" x2="10" y2="12"/>
              </svg>
              <div className="text-fs-11 text-text-muted text-center font-mono">
                No custom lists yet.
              </div>
              {!showCreateInline && (
                <button
                  type="button"
                  onClick={() => setShowCreateInline(true)}
                  className="bg-transparent border-none text-accent hover:text-white font-mono text-[10px] font-bold tracking-wider cursor-pointer transition-colors"
                >
                  + CREATE ONE
                </button>
              )}
            </div>
          ) : (
            customLists.map((list) => {
              const isChecked = memberships[list.id]?.checked || false;
              const isIndeterminate = memberships[list.id]?.indeterminate || false;

              return (
                <div
                  key={list.id}
                  onClick={() => handleToggle(list.id, !isChecked)}
                  className={`group/row flex items-center gap-3 px-3 py-2.5 select-none rounded-lg cursor-pointer transition-colors duration-100 ${
                    isChecked
                      ? 'bg-accent/8 hover:bg-accent/12'
                      : 'hover:bg-white/4'
                  }`}
                >
                  <CustomCheckbox
                    checked={isChecked}
                    indeterminate={isIndeterminate}
                  />
                  <span className="flex-1 truncate text-fs-13 text-text-hover font-medium">
                    {list.name}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border-subtle flex justify-end">
          <Button size="sm" onClick={handleClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
