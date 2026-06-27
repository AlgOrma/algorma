import React, { useState, useEffect, useCallback } from 'react';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import * as api from '../api';

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

export default function LeetCodeLibrary({ problems = [], onImportProblem }) {
  const [search, setSearch] = useState('');
  const [selectedDiff, setSelectedDiff] = useState('All');
  const [selectedTag, setSelectedTag] = useState('All');
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

  // Fetch questions
  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchLeetCodeQuestions({
        q: search,
        difficulty: selectedDiff,
        tag: selectedTag,
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
  }, [search, selectedDiff, selectedTag, page]);

  // Trigger fetch when filters or page change
  useEffect(() => {
    fetchQuestions();
    // Collapse expansion when query changes
    setExpandedId(null);
    setExpandedQuestion(null);
  }, [fetchQuestions]);

  // Handle enter key or button click on search
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchQuestions();
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
      alert(err.message || 'Import failed');
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

  // Simple Markdown to HTML formatter for editorial solutions
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

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1140px] mx-auto px-sp-30 pt-sp-26 pb-10 flex flex-col gap-4">
        {/* Header section */}
        <div className="text-left">
          <div className="text-fs-21 font-bold text-text-main tracking-[-0.015em]">
            LeetCode Library
          </div>
          <div className="font-mono text-fs-12 text-text-muted mt-1">
            {total} reference questions available to search and import
          </div>
        </div>

        {/* Search bar & filters */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-sp-9 flex-wrap">
          {/* Search input */}
          <div className="flex items-center gap-2 bg-bg-card border border-border-main rounded-card-btn px-3 py-2 w-sp-230">
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
              placeholder="Search library..."
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
              className="text-fs-12-5 text-text-hover bg-bg-card border border-border-main rounded-card-btn px-3 py-2 cursor-pointer outline-none transition-colors duration-200 focus:border-accent max-w-sp-200"
            >
              <option value="All">Tag: All</option>
              {POPULAR_TAGS.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>

          <Button type="submit">Search</Button>
        </form>

        {error && (
          <div className="p-3.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-fs-13 text-left">
            {error}
          </div>
        )}

        {/* Table Content */}
        <div className="bg-bg-card border border-border-card rounded-xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="grid grid-cols-[80px_2.3fr_0.9fr_1.8fr_140px] gap-3 px-sp-18 py-sp-11 border-b border-border-muted font-mono text-fs-9-5 text-border-accent tracking-[0.06em] text-left">
            <span>ID</span>
            <span>TITLE</span>
            <span>DIFFICULTY</span>
            <span>TAGS</span>
            <span className="text-right">ACTION</span>
          </div>

          {/* Rows */}
          <div className="flex flex-col">
            {loading ? (
              <div className="py-16 text-text-muted text-fs-14 text-center font-mono">
                Searching LeetCode questions database...
              </div>
            ) : questions.length === 0 ? (
              <div className="py-16 text-text-muted text-fs-14 text-center">
                No matching reference questions found.
              </div>
            ) : (
              questions.map((q) => {
                const isExpanded = expandedId === q.id;
                const imported = isImported(q.leetcodeUrl);

                return (
                  <div key={q.id} className="border-b border-bg-element-dark flex flex-col">
                    {/* Summary row */}
                    <div
                      onClick={() => handleToggleExpand(q.id)}
                      className="grid grid-cols-[80px_2.3fr_0.9fr_1.8fr_140px] gap-3 items-center px-sp-18 py-3 cursor-pointer text-left hover:bg-bg-element-hover transition-colors duration-150"
                    >
                      <span className="font-mono text-fs-12 text-text-muted">#{q.id}</span>
                      <span className="text-fs-13-5 text-text-main font-medium truncate flex items-center gap-1.5">
                        {q.title}
                        {q.isPaidOnly && (
                          <span className="font-mono text-[9px] bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 px-1 py-0.5 rounded">
                            Premium
                          </span>
                        )}
                      </span>
                      <Badge type="difficulty" value={q.difficulty} />
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

                      <div className="text-right">
                        <Button
                          size="sm"
                          variant={imported ? 'secondary' : 'primary'}
                          disabled={imported || importingId === q.id}
                          onClick={(e) => handleImport(e, q.id)}
                          style={{
                            minWidth: '82px',
                            padding: '4px 8px',
                            fontSize: '11.5px',
                            opacity: imported ? 0.6 : 1
                          }}
                        >
                          {importingId === q.id
                            ? 'Importing…'
                            : imported
                            ? '✓ Solved'
                            : 'Practice'}
                        </Button>
                      </div>
                    </div>

                    {/* Detailed info panel */}
                    {isExpanded && (
                      <div className="bg-bg-element-dark/40 border-t border-bg-element-dark/60 p-sp-18 flex flex-col gap-4 text-left">
                        {loadingDetail ? (
                          <div className="py-6 text-center text-text-muted font-mono text-fs-12">
                            Loading detailed problem description...
                          </div>
                        ) : !expandedQuestion ? (
                          <div className="text-center text-red-400 text-fs-12">
                            Failed to load details.
                          </div>
                        ) : (
                          <div className="flex gap-sp-18 flex-col lg:flex-row items-start">
                            {/* Left Description Pane */}
                            <div className="flex-1 min-w-0 flex flex-col gap-4">
                              {/* Description Content */}
                              <div>
                                <div className="font-mono text-[10px] text-border-accent tracking-[0.05em] mb-2">
                                  PROBLEM STATEMENT
                                </div>
                                <div
                                  className="text-fs-13.5 leading-relaxed text-text-hover pr-2 select-text leetcode-statement"
                                  dangerouslySetInnerHTML={{
                                    __html: expandedQuestion.statement || 'No description available.'
                                  }}
                                />
                              </div>

                              {/* Hints section */}
                              {expandedQuestion.hints && expandedQuestion.hints.length > 0 && (
                                <div className="mt-2">
                                  <div className="font-mono text-[10px] text-border-accent tracking-[0.05em] mb-2">
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
                                            onClick={() =>
                                              setRevealedHints((prev) => ({
                                                ...prev,
                                                [idx]: !prev[idx]
                                              }))
                                            }
                                            className="px-3 py-2 cursor-pointer bg-white/1.5 flex items-center justify-between text-fs-12.5 text-text-main select-none hover:bg-white/3 transition-colors"
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
                                <div className="font-mono text-[10px] text-border-accent tracking-[0.05em] mb-2">
                                  EDITORIAL SOLUTION
                                </div>
                                {!expandedQuestion.hasSolution ? (
                                  <span className="text-fs-12 text-text-muted">
                                    No editorial solution available.
                                  </span>
                                ) : !revealedSolution ? (
                                  <div className="border border-dashed border-border-main bg-bg-card p-4 rounded-lg flex flex-col items-center gap-2.5">
                                    <span className="text-fs-12.5 text-text-muted">
                                      Contains spoilers! Solution description and approach ahead.
                                    </span>
                                    <Button
                                      size="sm"
                                      onClick={() => setRevealedSolution(true)}
                                      style={{ padding: '6px 12px', fontSize: '12px' }}
                                    >
                                      Reveal Solution Article
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="border border-border-main bg-bg-card p-4 rounded-lg select-text overflow-hidden max-w-full">
                                    <div className="flex items-center justify-between mb-3 border-b border-border-main pb-2">
                                      <span className="font-semibold text-fs-13.5 text-text-main">
                                        Solution Article
                                      </span>
                                      <span
                                        onClick={() => setRevealedSolution(false)}
                                        className="font-mono text-fs-11 text-text-muted hover:text-text-main cursor-pointer"
                                      >
                                        [Hide]
                                      </span>
                                    </div>
                                    <div
                                      className="leetcode-solution text-fs-13 leading-relaxed"
                                      dangerouslySetInnerHTML={{
                                        __html: formatMarkdown(expandedQuestion.solutionContent)
                                      }}
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
                                    <span className="text-green-400">
                                      {expandedQuestion.likes.toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-text-muted">dislikes</span>
                                    <span className="text-red-400">
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
                                        <span className="text-accent">
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
                                    className="text-fs-12 text-accent hover:underline flex items-center justify-between"
                                  >
                                    <span>Open LeetCode ↗</span>
                                    <span className="text-fs-10 text-text-muted font-mono">
                                      leetcode.com
                                    </span>
                                  </a>
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
                                              className="text-accent hover:underline"
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
    </div>
  );
}
