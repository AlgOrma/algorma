import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import CustomListsModal from '../components/common/CustomListsModal';
import LeetCodeSyncModal from '../components/common/LeetCodeSyncModal';
import ConfirmationModal from '../components/common/ConfirmationModal';
import * as api from '../api';
import { pressable } from '../a11y';
import { formatMarkdown } from '../components/common/formatMarkdown';

const POPULAR_TAGS = [
  'Array',
  'Hash Table',
  'Two Pointers',
  'String',
  'Linked List',
  'Tree',
  'Binary Tree',
  'Graph',
  'Binary Search',
  'Dynamic Programming',
  'Depth-First Search',
  'Breadth-First Search',
  'Greedy',
  'Sorting',
  'Backtracking',
  'Stack',
  'Queue',
  'Heap (Priority Queue)',
  'Sliding Window',
  'Recursion',
  'Math'
];

export default function LeetCodeLibrary({
  problems = [],
  onImportProblem,
  onSaveProblem,
  customLists = [],
  onLoadCustomLists,
  onRefreshProblems
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedDiff, setSelectedDiff] = useState('All');
  const [selectedTag, setSelectedTag] = useState('All');
  const [curriculums, setCurriculums] = useState([]);
  const [selectedCurriculum, setSelectedCurriculum] = useState('All');

  // Add to List Select State
  const [addingToListId, setAddingToListId] = useState('');

  // Custom Lists Modal State
  const [isCustomListsModalOpen, setIsCustomListsModalOpen] = useState(false);
  const [selectedQuestionForList, setSelectedQuestionForList] = useState(null);

  // LeetCode account sync modal
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Transient feedback for list operations and failures (replaces window.alert).
  const [toast, setToast] = useState(null); // { msg, tone: 'success' | 'error' }
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Pending "remove from study list" confirmation (replaces window.confirm).
  const [removalTarget, setRemovalTarget] = useState(null); // { curriculumId, questionId }

  const [page, setPage] = useState(1);
  const [questions, setQuestions] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Detail view state
  const [expandedId, setExpandedId] = useState(null);
  const [expandedQuestion, setExpandedQuestion] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [revealedSolution, setRevealedSolution] = useState(false);
  const [revealedHints, setRevealedHints] = useState({}); // hint index -> bool
  const [importingId, setImportingId] = useState(null);

  // Debounce the search box so typing fires one request after a pause rather
  // than one per keystroke, and snap back to page 1 whenever the query changes.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load curriculums list
  const loadCurriculums = useCallback(async () => {
    try {
      const list = await api.getCurriculums();
      setCurriculums(list);
    } catch (err) {
      console.error('Failed to load curriculums:', err);
    }
  }, []);

  useEffect(() => {
    loadCurriculums();
  }, [loadCurriculums]);

  // Fetch questions
  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchLeetCodeQuestions({
        q: debouncedSearch,
        difficulty: selectedDiff,
        tag: selectedTag,
        curriculum: selectedCurriculum,
        page,
        limit: 25
      });
      setQuestions(res.items);
      setTotal(res.total);
      setTotalPages(res.pages);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load questions.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedDiff, selectedTag, selectedCurriculum, page]);

  // Trigger fetch when filters or page change
  useEffect(() => {
    fetchQuestions();
    // Collapse expansion when query changes
    setExpandedId(null);
    setExpandedQuestion(null);
  }, [fetchQuestions]);

  // Enter key / Search button: apply the query immediately, bypassing the debounce.
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    setDebouncedSearch(search);
  };

  // Toggle detail expansion
  const handleToggleExpand = async (qId) => {
    if (expandedId === qId) {
      setExpandedId(null);
      setExpandedQuestion(null);
      return;
    }

    setExpandedId(qId);
    setLoadingDetail(true);
    setRevealedSolution(false);
    setRevealedHints({});
    try {
      const detail = await api.getLeetCodeQuestion(qId);
      setExpandedQuestion(detail);
    } catch (err) {
      console.error(err);
      setError('Failed to load question details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Import question to personal list
  const handleImport = async (e, qId) => {
    e.stopPropagation();
    setImportingId(qId);
    try {
      const newProblem = await api.importLeetCodeQuestion(qId);
      if (onImportProblem) {
        onImportProblem(newProblem);
      }
    } catch (err) {
      setToast({ msg: err.message || 'Import failed', tone: 'error' });
    } finally {
      setImportingId(null);
    }
  };



  // Check if already in user's personal list
  const isImported = (leetcodeUrl) => {
    return problems.some(
      (p) => p.leetcodeUrl === leetcodeUrl || p.leetcode_url === leetcodeUrl
    );
  };

  // The formatted article is a heavy regex pass over a long document; the
  // whole page re-renders on every toast, import, and hint toggle, so the
  // formatting is cached per article rather than re-run per render.
  const solutionHtml = useMemo(
    () =>
      expandedQuestion?.solutionContent
        ? formatMarkdown(expandedQuestion.solutionContent)
        : '',
    [expandedQuestion?.solutionContent]
  );

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      {/* Quiet, on-system replacement for window.alert */}
      {toast && (
        <div
          className={`fixed top-5 left-1/2 -translate-x-1/2 z-[2100] bg-bg-card border text-fs-12 font-medium px-4 py-2.5 rounded-lg shadow-modal flex items-center gap-2 animate-fade-in ${
            toast.tone === 'error'
              ? 'border-badge-hard-border text-accent-red-text'
              : 'border-accent-green/30 text-accent-green'
          }`}
        >
          {toast.tone === 'error' ? (
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <circle cx="10" cy="10" r="8" />
              <line x1="10" y1="6.5" x2="10" y2="10.5" />
              <circle cx="10" cy="13.5" r="0.8" fill="currentColor" stroke="none" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <polyline points="17 5.5 8 15 3 10.2" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}

      <ConfirmationModal
        isOpen={!!removalTarget}
        title="Remove From Study List"
        message="Remove this question from the active study list?"
        confirmLabel="Remove"
        confirmVariant="red"
        onConfirm={async () => {
          const target = removalTarget;
          setRemovalTarget(null);
          if (!target) return;
          try {
            await api.removeQuestionFromCurriculum(target.curriculumId, target.questionId);
            setToast({ msg: 'Removed from study list', tone: 'success' });
            // Refresh
            fetchQuestions();
            loadCurriculums();
          } catch (err) {
            setToast({ msg: err.message || 'Failed to remove from list', tone: 'error' });
          }
        }}
        onCancel={() => setRemovalTarget(null)}
      />

      <div className="max-w-[1140px] mx-auto px-sp-30 pt-sp-26 pb-10 flex flex-col gap-4">
        {/* Header section */}
        <div className="flex items-start justify-between gap-4">
          <div className="text-left">
            <div className="text-fs-21 font-bold text-text-main tracking-[-0.015em]">
              LeetCode Library
            </div>
            <div className="font-mono text-fs-12 text-text-muted mt-1">
              {total} reference {total === 1 ? 'question' : 'questions'} available to search and import
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsSyncModalOpen(true)}
            title="Import your solved LeetCode problems as Done"
          >
            ⟳ Sync LeetCode Account
          </Button>
        </div>

        {/* Search bar & filters */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-sp-9 flex-wrap">
          {/* Search input */}
          <div className="lc-search flex items-center gap-2 bg-bg-card border border-border-main rounded-card-btn px-3 py-2 w-sp-230">
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              stroke="var(--color-border-accent)"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <circle cx="9" cy="9" r="6" />
              <line x1="13.5" y1="13.5" x2="17" y2="17" />
            </svg>
            <input
              type="text"
              placeholder="Search by title or number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none outline-none text-text-main text-fs-13 w-full p-0"
            />
          </div>

          <div className="flex gap-1.5">
            {/* Difficulty filter */}
            <select
              value={selectedDiff}
              onChange={(e) => {
                setSelectedDiff(e.target.value);
                setPage(1);
              }}
              className="text-fs-12-5 text-text-hover bg-bg-card border border-border-main rounded-card-btn px-3 py-2 cursor-pointer outline-none transition-colors duration-200 focus:border-accent"
            >
              <option value="All">Difficulty: All</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>

            {/* Tags filter */}
            <select
              value={selectedTag}
              onChange={(e) => {
                setSelectedTag(e.target.value);
                setPage(1);
              }}
              className="text-fs-12-5 text-text-hover bg-bg-card border border-border-main rounded-card-btn px-3 py-2 cursor-pointer outline-none transition-colors duration-200 focus:border-accent max-w-[200px]"
            >
              <option value="All">Tag: All</option>
              {POPULAR_TAGS.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>

            {/* Curriculum filter */}
            <select
              value={selectedCurriculum}
              onChange={(e) => {
                setSelectedCurriculum(e.target.value);
                setPage(1);
              }}
              className="text-fs-12-5 text-text-hover bg-bg-card border border-border-main rounded-card-btn px-3 py-2 cursor-pointer outline-none transition-colors duration-200 focus:border-accent max-w-[200px]"
            >
              <option value="All">Curriculum: All</option>
              {curriculums.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name} ({c.questionCount})
                </option>
              ))}
            </select>
          </div>
        </form>

        {error && (
          <div className="p-3.5 bg-badge-hard-bg border border-badge-hard-border text-accent-red-text rounded-lg text-fs-13 text-left">
            {error}
          </div>
        )}

        {/* Table Content */}
        <div className="bg-bg-card border border-border-card rounded-xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="grid grid-cols-[50px_2.5fr_0.9fr_1.8fr_180px] gap-3 px-sp-18 py-sp-11 border-b border-border-muted font-mono text-fs-9-5 text-text-muted tracking-[0.06em] text-left">
            <span>#</span>
            <span>TITLE</span>
            <span>DIFFICULTY</span>
            <span>TAGS</span>
            <span className="text-right">ACTION</span>
          </div>

          {/* Rows — keep results on screen and softly dim them while the next
              query loads, so typing updates smoothly instead of flickering. The
              skeleton only shows on the very first load (nothing on screen yet). */}
          <div
            className={`flex flex-col transition-opacity duration-200 ${
              loading && questions.length > 0
                ? 'opacity-50 pointer-events-none'
                : 'opacity-100'
            }`}
          >
            {loading && questions.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[50px_2.5fr_0.9fr_1.8fr_180px] gap-3 items-center px-sp-18 py-3.5 border-b border-bg-element-dark"
                >
                  <div className="lc-skeleton h-3 w-4" />
                  <div className="lc-skeleton h-3.5 w-3/5" />
                  <div className="lc-skeleton h-4 w-14 rounded-full" />
                  <div className="flex gap-1.5">
                    <div className="lc-skeleton h-3.5 w-12" />
                    <div className="lc-skeleton h-3.5 w-10" />
                  </div>
                  <div className="lc-skeleton h-6 w-[82px] ml-auto rounded-card-btn" />
                </div>
              ))
            ) : questions.length === 0 ? (
              <div className="py-16 text-text-muted text-fs-14 text-center">
                No matching reference questions found.
              </div>
            ) : (
              questions.map((q, idx) => {
                const isExpanded = expandedId === q.id;
                const imported = isImported(q.leetcodeUrl);

                return (
                  <div
                    key={q.id}
                    className="border-b border-bg-element-dark flex flex-col"
                  >
                    {/* Summary row */}
                    <div
                      {...pressable(() => handleToggleExpand(q.id), { 'aria-expanded': isExpanded })}
                      className="grid grid-cols-[50px_2.5fr_0.9fr_1.8fr_180px] gap-3 items-center px-sp-18 py-3 cursor-pointer text-left hover:bg-bg-element-hover transition-colors duration-150"
                    >
                      <span className="font-mono text-fs-12 text-text-muted select-none">
                        {((page - 1) * 25) + idx + 1}.
                      </span>
                      <span className="text-fs-13-5 text-text-main font-medium truncate flex items-center">
                        <span className="font-mono text-fs-12 text-text-muted mr-2 shrink-0 select-none opacity-60">
                          #{q.id}
                        </span>
                        <span className="truncate">{q.title}</span>
                        {q.isPaidOnly && (
                          <span className="font-mono text-[9px] bg-badge-medium-bg border border-badge-medium-border text-accent-orange px-1 py-0.5 rounded">
                            Premium
                          </span>
                        )}
                      </span>
                      <Badge type="difficulty" value={q.difficulty} className="justify-self-start" />
                      <div className="flex flex-wrap gap-1 truncate max-w-full">
                        {q.topicTags.slice(0, 3).map((tag, idx) => (
                          <span
                            key={idx}
                            className="font-mono text-[10px] text-text-muted bg-white/4 px-1.5 py-0.5 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                        {q.topicTags.length > 3 && (
                          <span className="font-mono text-[10px] text-text-muted opacity-60">
                            +{q.topicTags.length - 3}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-2 text-right">
                        <Button
                          size="sm"
                          variant={imported ? 'secondary' : 'primary'}
                          disabled={imported || importingId === q.id}
                          onClick={(e) => handleImport(e, q.id)}
                          style={{
                            minWidth: '85px',
                            opacity: imported ? 0.65 : 1
                          }}
                        >
                          {importingId === q.id
                            ? 'Importing…'
                            : imported
                            ? '✓ Added'
                            : 'Practice'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Save to Playlist"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedQuestionForList(q);
                            setIsCustomListsModalOpen(true);
                          }}
                          style={{ minWidth: '32px' }}
                        >
                          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3.5" y1="6" x2="16.5" y2="6"/>
                            <line x1="3.5" y1="10" x2="16.5" y2="10"/>
                            <line x1="3.5" y1="14" x2="11.5" y2="14"/>
                            <path d="M14.5 13v4M16.5 15h-4"/>
                          </svg>
                        </Button>
                      </div>
                    </div>

                    {/* Detailed info panel */}
                    {isExpanded && (
                      <div className="lc-expand bg-bg-element-dark/40 border-t border-bg-element-dark/60 p-sp-18 flex flex-col gap-4 text-left">
                        {loadingDetail ? (
                          <div className="py-6 text-center text-text-muted font-mono text-fs-12">
                            Loading detailed problem description...
                          </div>
                        ) : !expandedQuestion ? (
                          <div className="text-center text-accent-red-text text-fs-12">
                            Failed to load details.
                          </div>
                        ) : (
                          <div className="flex gap-sp-18 flex-col lg:flex-row items-start">
                            {/* Left Description Pane */}
                            <div className="flex-1 min-w-0 flex flex-col gap-4">
                              {/* Description Content */}
                              <div>
                                <div className="font-mono text-[10px] text-text-muted tracking-[0.05em] mb-2">
                                  PROBLEM STATEMENT
                                </div>
                                <div
                                  className="text-fs-13-5 leading-relaxed text-text-hover pr-2 select-text leetcode-statement"
                                  dangerouslySetInnerHTML={{
                                    __html: expandedQuestion.statement || 'No description available.'
                                  }}
                                />
                              </div>

                              {/* Hints section */}
                              {expandedQuestion.hints && expandedQuestion.hints.length > 0 && (
                                <div className="mt-2">
                                  <div className="font-mono text-[10px] text-text-muted tracking-[0.05em] mb-2">
                                    HINTS ({expandedQuestion.hints.length})
                                  </div>
                                  <div className="flex flex-col gap-1.5">
                                    {expandedQuestion.hints.map((hint, idx) => {
                                      const isHintRevealed = revealedHints[idx];
                                      return (
                                        <div
                                          key={idx}
                                          className="border border-border-main rounded-md overflow-hidden bg-bg-card"
                                        >
                                          <div
                                            {...pressable(
                                              () =>
                                                setRevealedHints((prev) => ({
                                                  ...prev,
                                                  [idx]: !prev[idx]
                                                })),
                                              { 'aria-expanded': !!isHintRevealed }
                                            )}
                                            className="px-3 py-2 cursor-pointer bg-white/2 flex items-center justify-between text-fs-12-5 text-text-main select-none hover:bg-white/3 transition-colors"
                                          >
                                            <span className="font-medium">Hint {idx + 1}</span>
                                            <span className="font-mono text-text-muted">
                                              {isHintRevealed ? '▲ Hide' : '▼ Show'}
                                            </span>
                                          </div>
                                          {isHintRevealed && (
                                            <div
                                              className="p-3 text-fs-13 text-text-hover select-text border-t border-border-main"
                                              dangerouslySetInnerHTML={{ __html: hint }}
                                            />
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Editorial Solution */}
                              <div className="mt-2">
                                <div className="font-mono text-[10px] text-text-muted tracking-[0.05em] mb-2">
                                  EDITORIAL SOLUTION
                                </div>
                                {!expandedQuestion.hasSolution ? (
                                  <span className="text-fs-12 text-text-muted">
                                    No editorial solution available.
                                  </span>
                                ) : !revealedSolution ? (
                                  <div className="border border-dashed border-border-main bg-bg-card p-4 rounded-lg flex flex-col items-center gap-2.5">
                                    <span className="text-fs-12-5 text-text-muted">
                                      Contains spoilers! Solution description and approach ahead.
                                    </span>
                                    <Button
                                      size="sm"
                                      onClick={() => setRevealedSolution(true)}
                                    >
                                      Reveal Solution Article
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="border border-border-main bg-bg-card p-4 rounded-lg select-text overflow-hidden max-w-full">
                                    <div className="flex items-center justify-between mb-3 border-b border-border-main pb-2">
                                      <span className="font-semibold text-fs-13-5 text-text-main">
                                        Solution Article
                                      </span>
                                      <span
                                        {...pressable(() => setRevealedSolution(false), { 'aria-label': 'Hide solution article' })}
                                        className="font-mono text-fs-11 text-text-muted hover:text-text-main cursor-pointer"
                                      >
                                        [Hide]
                                      </span>
                                    </div>
                                    <div
                                      className="leetcode-solution text-fs-13 leading-relaxed"
                                      dangerouslySetInnerHTML={{ __html: solutionHtml }}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Right Stats Sidebar */}
                            <div className="w-full lg:w-sp-230 flex flex-col gap-3 shrink-0">
                              {/* Metadata and Stats */}
                              <div className="bg-bg-card border border-border-card rounded-xl p-3.5 flex flex-col gap-3">
                                <div className="text-fs-13 font-semibold text-text-main">
                                  Reference Details
                                </div>
                                <div className="flex flex-col gap-2 font-mono text-fs-11-5">
                                  <div className="flex justify-between">
                                    <span className="text-text-muted">category</span>
                                    <span className="text-text-hover">
                                      {expandedQuestion.categoryTitle}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-text-muted">likes</span>
                                    <span className="text-accent-green">
                                      {expandedQuestion.likes.toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-text-muted">dislikes</span>
                                    <span className="text-accent-red-text">
                                      {expandedQuestion.dislikes.toLocaleString()}
                                    </span>
                                  </div>
                                </div>

                                {expandedQuestion.stats && (
                                  <>
                                    <div className="h-sp-1 bg-border-main my-1"></div>
                                    <div className="flex flex-col gap-2 font-mono text-fs-11-5">
                                      <div className="flex justify-between">
                                        <span className="text-text-muted">ac rate</span>
                                        <span className="text-accent-text">
                                          {expandedQuestion.stats.acRate}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-text-muted">accepted</span>
                                        <span className="text-text-hover">
                                          {expandedQuestion.stats.totalAccepted}
                                        </span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-text-muted">submissions</span>
                                        <span className="text-text-hover">
                                          {expandedQuestion.stats.totalSubmission}
                                        </span>
                                      </div>
                                    </div>
                                  </>
                                )}

                                <div className="h-sp-1 bg-border-main my-1"></div>
                                <div className="flex flex-col gap-2">
                                  <a
                                    href={expandedQuestion.leetcodeUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-fs-12 text-accent-text hover:underline flex items-center justify-between"
                                  >
                                    <span>Open LeetCode ↗</span>
                                    <span className="text-fs-10 text-text-muted font-mono">
                                      leetcode.com
                                    </span>
                                  </a>
                                </div>
                              </div>

                              {/* Custom Playlists management */}
                              <div className="bg-bg-card border border-border-card rounded-xl p-3.5 flex flex-col gap-2.5">
                                <div className="text-fs-13 font-semibold text-text-main text-left">
                                  Custom Playlists
                                </div>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedQuestionForList(expandedQuestion);
                                    setIsCustomListsModalOpen(true);
                                  }}
                                  className="w-full text-center"
                                >
                                  Manage playlists...
                                </Button>
                              </div>

                              {/* Study Lists management */}
                              <div className="bg-bg-card border border-border-card rounded-xl p-3.5 flex flex-col gap-2.5">
                                <div className="text-fs-13 font-semibold text-text-main text-left">
                                  Study Lists
                                </div>
                                <div className="flex flex-col gap-2">
                                  <select
                                    value={addingToListId}
                                    onChange={async (e) => {
                                      const val = e.target.value;
                                      if (!val) return;
                                      setAddingToListId(val);
                                      const listName = curriculums.find((c) => String(c.id) === String(val))?.name || 'study list';
                                      try {
                                        await api.addQuestionsToCurriculum(val, [expandedQuestion.id]);
                                        setToast({ msg: `Added to ${listName}`, tone: 'success' });
                                        // Refresh
                                        loadCurriculums();
                                      } catch (err) {
                                        setToast({ msg: err.message || 'Failed to add to curriculum list', tone: 'error' });
                                      } finally {
                                        setAddingToListId('');
                                      }
                                    }}
                                    className="text-fs-12 text-text-hover bg-bg-element-dark border border-border-main rounded-md px-2 py-1.5 cursor-pointer outline-none w-full"
                                  >
                                    <option value="">+ Add to list...</option>
                                    {curriculums.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>

                                  {selectedCurriculum !== 'All' && (
                                    <button
                                      onClick={() => {
                                        const activeCurrObj = curriculums.find(c => c.slug === selectedCurriculum);
                                        if (!activeCurrObj) return;
                                        setRemovalTarget({ curriculumId: activeCurrObj.id, questionId: expandedQuestion.id });
                                      }}
                                      className="text-fs-11 text-accent-red-text hover:text-text-main font-semibold border border-badge-hard-border hover:border-accent-red-text/40 bg-badge-hard-bg py-1.5 rounded-md cursor-pointer transition-colors w-full text-center"
                                    >
                                      ✕ Remove From List
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Similar Questions */}
                              {expandedQuestion.similarQuestions &&
                                expandedQuestion.similarQuestions.length > 0 && (
                                  <div className="bg-bg-card border border-border-card rounded-xl p-3.5 flex flex-col gap-2.5">
                                    <div className="text-fs-13 font-semibold text-text-main text-left">
                                      Similar Questions
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                      {expandedQuestion.similarQuestions.map((sq, idx) => (
                                        <div
                                          key={idx}
                                          className="text-left text-fs-12 leading-normal border border-border-main/50 bg-white/1 p-2 rounded hover:bg-white/2"
                                        >
                                          <div className="font-medium text-text-hover text-ellipsis overflow-hidden">
                                            {sq.title}
                                          </div>
                                          <div className="flex items-center justify-between font-mono text-[10px] text-text-muted mt-1">
                                            <span>{sq.difficulty}</span>
                                            <a
                                              href={`https://leetcode.com/problems/${sq.titleSlug}/`}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="text-accent-text hover:underline"
                                            >
                                              Link
                                            </a>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-2 font-mono text-fs-12">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1.5 rounded bg-bg-card border border-border-main disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/3 transition-colors"
            >
              ◀ Prev
            </button>
            <span className="text-text-muted px-2">
              Page <strong className="text-text-main">{page}</strong> of{' '}
              <strong className="text-text-main">{totalPages}</strong>
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2.5 py-1.5 rounded bg-bg-card border border-border-main disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/3 transition-colors"
            >
              Next ▶
            </button>
          </div>
        )}
      </div>

      <LeetCodeSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSynced={onRefreshProblems}
      />

      <CustomListsModal
        isOpen={isCustomListsModalOpen}
        target={selectedQuestionForList}
        problems={problems}
        customLists={customLists}
        onClose={() => {
          setIsCustomListsModalOpen(false);
          setSelectedQuestionForList(null);
        }}
        onSaveProblem={onSaveProblem}
        onLoadCustomLists={onLoadCustomLists}
        onRefreshProblems={onRefreshProblems}
      />
    </div>
  );
}
