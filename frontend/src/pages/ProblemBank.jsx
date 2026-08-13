import React, { useState, useMemo, useEffect, useRef } from 'react';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import CustomListsModal from '../components/common/CustomListsModal';
import ConfirmationModal from '../components/common/ConfirmationModal';

const GRID_COLS = 'grid-cols-[38px_2.1fr_0.95fr_62px_116px_96px_78px_45px]';
const DIFF_RANK = { Easy: 0, Medium: 1, Hard: 2 };

export default function ProblemBank({
  problems = [],
  problemsLoading = false,
  problemsError = false,
  onRetryProblems,
  onOpenProblem,
  onNewProblem,
  onDeleteProblems,
  onReviseProblems,
  initialSearchQuery = '',
  customLists = [],
  onLoadCustomLists,
  onRefreshProblems
}) {
  const [search, setSearch] = useState(initialSearchQuery);
  const [selectedTopic, setSelectedTopic] = useState('All');
  const [selectedDiff, setSelectedDiff] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedPlaylist, setSelectedPlaylist] = useState('All');

  // Custom Lists modal state
  const [isCustomListsModalOpen, setIsCustomListsModalOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState(null);
  const [dueOnly, setDueOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteFailedCount, setDeleteFailedCount] = useState(0);

  // Sorting: key is a payload field; ISO strings compare lexicographically.
  const [sort, setSort] = useState(null); // { key: 'dueAt'|'lastReviewedAt'|'difficulty', dir: 1|-1 }

  // Selection survives searching and filtering (cross-filter curation is a
  // supported workflow); it only sheds ids whose problems left the bank.
  useEffect(() => {
    setSelectedIds(prev => prev.filter(id => problems.some(p => p.id === id)));
  }, [problems]);

  const handleToggleSelectAll = () => {
    setDeleteFailedCount(0);
    const allFilteredIds = filteredProblems.map(p => p.id);
    const areAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.includes(id));
    if (areAllSelected) {
      setSelectedIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      setSelectedIds(prev => {
        const next = [...prev];
        allFilteredIds.forEach(id => {
          if (!next.includes(id)) next.push(id);
        });
        return next;
      });
    }
  };

  const handleToggleSelect = (id) => {
    setDeleteFailedCount(0);
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleConfirmDelete = async () => {
    setShowDeleteConfirm(false);
    const failed = (await onDeleteProblems(selectedIds)) || [];
    setSelectedIds(failed);
    setDeleteFailedCount(failed.length);
  };

  // Sync initial search query if redirected from dashboard search
  useEffect(() => {
    if (initialSearchQuery) {
      setSearch(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  // "/" focuses search, like the ⌘K convention on the dashboard.
  const searchRef = useRef(null);
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target.tagName;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Extract unique values for filter dropdowns
  const uniqueTopics = useMemo(() => {
    const topics = new Set(problems.map(p => p.topic));
    return ['All', ...Array.from(topics).sort((a, b) => a.localeCompare(b))];
  }, [problems]);

  const uniqueDiffs = ['All', 'Easy', 'Medium', 'Hard'];
  const uniqueStatuses = ['All', 'Done', 'Solving', 'Not started'];

  // Filter logic
  const filteredProblems = useMemo(() => {
    return problems.filter(p => {
      const matchesSearch =
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.topic.toLowerCase().includes(search.toLowerCase());

      const matchesTopic = selectedTopic === 'All' || p.topic === selectedTopic;
      const matchesDiff = selectedDiff === 'All' || p.difficulty === selectedDiff;
      const matchesStatus = selectedStatus === 'All' || p.status === selectedStatus;

      const matchesPlaylist = selectedPlaylist === 'All' || (p.customListIds && p.customListIds.includes(selectedPlaylist));

      const matchesDue = !dueOnly || p.due;

      return matchesSearch && matchesTopic && matchesDiff && matchesStatus && matchesPlaylist && matchesDue;
    });
  }, [problems, search, selectedTopic, selectedDiff, selectedStatus, selectedPlaylist, dueOnly]);

  const sortedProblems = useMemo(() => {
    if (!sort) return filteredProblems;
    const value = (p) =>
      sort.key === 'difficulty' ? DIFF_RANK[p.difficulty] ?? 99 : p[sort.key];
    return [...filteredProblems].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // never-scheduled rows sink regardless of direction
      if (bv == null) return -1;
      return av < bv ? -sort.dir : av > bv ? sort.dir : 0;
    });
  }, [filteredProblems, sort]);

  const cycleSort = (key) => {
    setSort(prev => {
      if (prev?.key !== key) return { key, dir: 1 };
      if (prev.dir === 1) return { key, dir: -1 };
      return null;
    });
  };

  const sortMark = (key) =>
    sort?.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : '';
  const ariaSort = (key) =>
    sort?.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none';

  const filtersActive =
    search !== '' || selectedTopic !== 'All' || selectedDiff !== 'All' ||
    selectedStatus !== 'All' || selectedPlaylist !== 'All' || dueOnly;

  const clearFilters = () => {
    setSearch('');
    setSelectedTopic('All');
    setSelectedDiff('All');
    setSelectedStatus('All');
    setSelectedPlaylist('All');
    setDueOnly(false);
  };

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredIdSet = useMemo(() => new Set(filteredProblems.map(p => p.id)), [filteredProblems]);
  const allFilteredSelected =
    filteredProblems.length > 0 && filteredProblems.every(p => selectedIdSet.has(p.id));
  const someFilteredSelected = filteredProblems.some(p => selectedIdSet.has(p.id));
  const hiddenSelectedCount = selectedIds.filter(id => !filteredIdSet.has(id)).length;

  const selectAllRef = useRef(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someFilteredSelected && !allFilteredSelected;
    }
  }, [someFilteredSelected, allFilteredSelected]);

  const bulkActive = selectedIds.length > 0;
  const isFirstRun = !problemsLoading && !problemsError && problems.length === 0;

  const headerCount = problemsLoading && problems.length === 0
    ? 'loading…'
    : filtersActive && filteredProblems.length !== problems.length
      ? `${filteredProblems.length} of ${problems.length} problems`
      : `${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}`;

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1140px] mx-auto px-sp-30 pt-sp-26 pb-10 flex flex-col gap-4">
      {/* Header section */}
      <div className="flex items-center justify-between">
        <div className="text-left">
          <div className="text-fs-21 font-bold text-text-main tracking-[-0.015em]">
            Problem bank
          </div>
          <div role="status" className="font-mono text-fs-12 text-text-muted mt-1">
            {headerCount}
          </div>
        </div>

        <Button onClick={onNewProblem}>
          <span className="text-fs-16 leading-[0] mt-[-1px]">+</span> New problem
        </Button>
      </div>

      {/* Problems fetch failed while stale rows are shown */}
      {problemsError && problems.length > 0 && (
        <div role="status" className="flex items-center gap-3 bg-bg-card border border-border-main rounded-card-md px-sp-14 py-sp-9 font-mono text-fs-12 text-text-muted">
          Couldn't refresh your problems — this list may be out of date.
          <button
            type="button"
            onClick={onRetryProblems}
            className="font-mono text-fs-12 text-accent-text cursor-pointer bg-transparent p-0 hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Filter and search bar */}
      <div className="flex items-center gap-sp-9 flex-wrap">

        {/* Search input */}
        <div className="lc-search flex items-center gap-2 bg-bg-card border border-border-main rounded-card-btn px-3 py-2 w-sp-230">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="9" cy="9" r="6" />
            <line x1="13.5" y1="13.5" x2="17" y2="17" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            aria-label="Search problems by title or topic"
            placeholder="Search title or topic…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none text-text-main text-fs-13 w-full p-0"
          />
          {search ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => { setSearch(''); searchRef.current?.focus(); }}
              className="bg-transparent p-0 text-text-muted hover:text-text-main text-fs-12 cursor-pointer leading-none"
            >
              ✕
            </button>
          ) : (
            <span className="font-mono text-fs-11 text-text-muted" aria-hidden="true">/</span>
          )}
        </div>

        {/* Dropdowns */}
        <div className="flex gap-1.5">
          {/* Topic filter */}
          <select
            value={selectedTopic}
            aria-label="Filter by topic"
            onChange={(e) => setSelectedTopic(e.target.value)}
            className={`text-fs-12-5 text-text-hover bg-bg-card border border-border-main rounded-card-btn px-3 py-2 cursor-pointer outline-none transition-colors duration-200 ${selectedTopic !== 'All' ? 'filter-active' : ''}`}
          >
            <option value="All">Topic: All</option>
            {uniqueTopics.filter(t => t !== 'All').map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* List filter */}
          <select
            value={selectedPlaylist}
            aria-label="Filter by custom list"
            onChange={(e) => setSelectedPlaylist(e.target.value)}
            className={`text-fs-12-5 text-text-hover bg-bg-card border border-border-main rounded-card-btn px-3 py-2 cursor-pointer outline-none transition-colors duration-200 ${selectedPlaylist !== 'All' ? 'filter-active' : ''}`}
          >
            <option value="All">List: All</option>
            {customLists.map(pl => (
              <option key={pl.id} value={pl.id}>{pl.name}</option>
            ))}
          </select>

          {/* Difficulty filter */}
          <select
            value={selectedDiff}
            aria-label="Filter by difficulty"
            onChange={(e) => setSelectedDiff(e.target.value)}
            className={`text-fs-12-5 text-text-hover bg-bg-card border border-border-main rounded-card-btn px-3 py-2 cursor-pointer outline-none transition-colors duration-200 ${selectedDiff !== 'All' ? 'filter-active' : ''}`}
          >
            <option value="All">Difficulty: All</option>
            {uniqueDiffs.filter(d => d !== 'All').map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={selectedStatus}
            aria-label="Filter by status"
            onChange={(e) => setSelectedStatus(e.target.value)}
            className={`text-fs-12-5 text-text-hover bg-bg-card border border-border-main rounded-card-btn px-3 py-2 cursor-pointer outline-none transition-colors duration-200 ${selectedStatus !== 'All' ? 'filter-active' : ''}`}
          >
            <option value="All">Status: All</option>
            {uniqueStatuses.filter(s => s !== 'All').map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Due Switch */}
        <button
          type="button"
          role="switch"
          aria-checked={dueOnly}
          onClick={() => setDueOnly(!dueOnly)}
          className="flex items-center gap-sp-9 cursor-pointer text-fs-12-5 text-text-hover bg-bg-card ring-1 ring-border-main rounded-card-btn px-3 py-2 ml-auto select-none"
        >
          {/* Toggle pill — white knob passes 3:1 on both track colors */}
          <span aria-hidden="true" className={`w-sp-30 h-sp-17 rounded-card-btn flex items-center p-sp-2 transition-all duration-150 ${dueOnly ? 'bg-accent justify-end' : 'bg-border-btn justify-start'}`}>
            <span className="w-sp-13 h-sp-13 rounded-full bg-white"></span>
          </span>
          Due for revision
        </button>

        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="font-mono text-fs-12 text-accent-text hover:text-text-main cursor-pointer bg-transparent p-0"
          >
            ✕ Clear filters
          </button>
        )}

      </div>

      {/* Problems Bank List Grid */}
      <div className="bg-bg-card border border-border-card rounded-xl flex flex-col">
        {/* Bulk Action Bar — sticky so selections deep in the list stay actionable */}
        {bulkActive && (
          <div className="sticky top-0 z-20 flex items-center justify-between px-sp-18 py-2.5 bg-bg-element-dark border-b border-border-main text-fs-13 rounded-t-xl min-h-[46px]">
            <div className="flex items-center gap-3">
              <span className="font-medium text-text-main">
                {selectedIds.length} {selectedIds.length === 1 ? 'problem' : 'problems'} selected
              </span>
              {hiddenSelectedCount > 0 && (
                <span className="font-mono text-fs-11 text-text-muted">
                  · {hiddenSelectedCount} filtered from view
                </span>
              )}
              {deleteFailedCount > 0 && (
                <span role="status" className="font-mono text-fs-11 text-accent-red-text">
                  couldn't delete {deleteFailedCount} — still selected
                </span>
              )}
              <span className="text-text-muted">|</span>
              <button
                onClick={() => { setSelectedIds([]); setDeleteFailedCount(0); }}
                className="text-fs-12-5 text-accent-text hover:text-text-main cursor-pointer outline-none bg-transparent border-none p-0"
              >
                Deselect all
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setModalTarget(selectedIds);
                  setIsCustomListsModalOpen(true);
                }}
                className="cursor-pointer"
              >
                Add to List
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const selectedProblems = problems.filter(p => selectedIds.includes(p.id));
                  if (onReviseProblems) onReviseProblems(selectedProblems);
                }}
                className="cursor-pointer"
              >
                Revise Selected
              </Button>
              <Button
                variant="red"
                size="sm"
                onClick={() => selectedIds.length > 0 && setShowDeleteConfirm(true)}
                className="cursor-pointer"
              >
                Delete Selected
              </Button>
            </div>
          </div>
        )}

        <div role="table" aria-label="Problems">
          {/* Table Header */}
          <div role="rowgroup">
            <div
              role="row"
              className={`sticky z-10 bg-bg-card grid ${GRID_COLS} gap-3 px-sp-18 py-sp-11 border-b border-border-muted font-mono text-fs-10 text-text-muted tracking-[0.06em] text-left items-center ${bulkActive ? 'top-[46px]' : 'top-0 rounded-t-xl'}`}
            >
              <div role="columnheader" className="flex items-center justify-center">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  className="pb-checkbox"
                  aria-label="Select all filtered problems"
                  checked={allFilteredSelected}
                  onChange={handleToggleSelectAll}
                  disabled={filteredProblems.length === 0}
                />
              </div>
              <span role="columnheader">TITLE</span>
              <span role="columnheader">TOPIC</span>
              <span role="columnheader" aria-sort={ariaSort('difficulty')}>
                <button
                  type="button"
                  onClick={() => cycleSort('difficulty')}
                  className="bg-transparent p-0 font-mono text-fs-10 text-text-muted tracking-[0.06em] cursor-pointer hover:text-text-main"
                >
                  DIFF{sortMark('difficulty')}
                </button>
              </span>
              <span role="columnheader">STATUS</span>
              <span role="columnheader" aria-sort={ariaSort('lastReviewedAt')}>
                <button
                  type="button"
                  onClick={() => cycleSort('lastReviewedAt')}
                  className="bg-transparent p-0 font-mono text-fs-10 text-text-muted tracking-[0.06em] cursor-pointer hover:text-text-main"
                >
                  LAST REV{sortMark('lastReviewedAt')}
                </button>
              </span>
              <span role="columnheader" aria-sort={ariaSort('dueAt')} className="text-right">
                <button
                  type="button"
                  onClick={() => cycleSort('dueAt')}
                  title="Sort by next review — ascending floats overdue to the top"
                  className="bg-transparent p-0 font-mono text-fs-10 text-text-muted tracking-[0.06em] cursor-pointer hover:text-text-main"
                >
                  NEXT{sortMark('dueAt')}
                </button>
              </span>
              <span role="columnheader" aria-label="Actions"></span>
            </div>
          </div>

          {/* Table Rows */}
          <div role="rowgroup" className="flex flex-col">
            {sortedProblems.map((row) => {
              const isSelected = selectedIdSet.has(row.id);
              return (
                <div
                  role="row"
                  key={row.id}
                  onClick={() => onOpenProblem(row.id)}
                  className={`grid ${GRID_COLS} gap-3 items-center px-sp-18 py-3 border-b border-bg-element-dark cursor-pointer text-left transition-colors duration-150 ${isSelected ? 'bg-accent/10' : 'hover:bg-bg-element-hover'}`}
                >
                  <div role="cell" className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="pb-checkbox"
                      aria-label={`Select ${row.title}`}
                      checked={isSelected}
                      onChange={() => handleToggleSelect(row.id)}
                    />
                  </div>
                  <span role="cell" className="min-w-0">
                    <a
                      href={`/problems/${row.id}`}
                      title={row.title}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenProblem(row.id); }}
                      className="block text-fs-13-5 text-text-main font-medium truncate hover:underline"
                    >
                      {row.title}
                    </a>
                  </span>
                  <span role="cell" className="font-mono text-fs-11-5 text-text-hover truncate">
                    {row.topic}
                  </span>

                  <span role="cell"><Badge type="difficulty" value={row.difficulty} /></span>
                  <span role="cell"><Badge type="status" value={row.status} /></span>

                  <span role="cell" className="font-mono text-fs-11 text-text-muted">
                    {row.lastRevised || '—'}
                  </span>
                  <span
                    role="cell"
                    className={`font-mono text-fs-11 text-right ${row.overdue ? 'text-accent-red-text' : row.due ? 'text-accent-text' : 'text-text-muted'}`}
                  >
                    {row.overdue ? (row.nextLabel || 'overdue') : row.due ? 'today' : row.nextLabel || '—'}
                  </span>
                  <div role="cell" className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
                    <button
                      title="Add to list"
                      aria-label={`Add ${row.title} to a list`}
                      onClick={() => {
                        setModalTarget(row);
                        setIsCustomListsModalOpen(true);
                      }}
                      className="bg-transparent border-none text-text-muted hover:text-accent-text font-mono text-fs-12 cursor-pointer transition-colors p-1"
                    >
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="3.5" y1="6" x2="16.5" y2="6"/>
                        <line x1="3.5" y1="10" x2="16.5" y2="10"/>
                        <line x1="3.5" y1="14" x2="11.5" y2="14"/>
                        <path d="M14.5 13v4M16.5 15h-4"/>
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Empty body states: loading, fetch failure, first run, no matches */}
            {sortedProblems.length === 0 && problemsLoading && (
              <div className="flex flex-col gap-2 px-sp-18 py-4">
                <span className="lc-skeleton block h-10" aria-hidden="true" />
                <span className="lc-skeleton block h-10" aria-hidden="true" />
                <span className="lc-skeleton block h-10" aria-hidden="true" />
                <span className="lc-skeleton block h-10" aria-hidden="true" />
              </div>
            )}
            {sortedProblems.length === 0 && !problemsLoading && problemsError && problems.length === 0 && (
              <div role="status" className="py-10 px-5 text-center font-mono text-fs-12 text-text-muted">
                Couldn't load your problems —{' '}
                <button
                  type="button"
                  onClick={onRetryProblems}
                  className="font-mono text-fs-12 text-accent-text cursor-pointer bg-transparent p-0 hover:underline"
                >
                  Try again
                </button>
              </div>
            )}
            {sortedProblems.length === 0 && isFirstRun && (
              <div className="py-10 px-5 text-center">
                <div className="text-text-muted text-fs-14">No problems yet.</div>
                <div className="text-fs-12-5 text-text-muted mt-sp-5">
                  Import your first from the LeetCode catalog to start practicing.
                </div>
                <Button onClick={onNewProblem} className="mt-3">
                  Browse LeetCode catalog
                </Button>
              </div>
            )}
            {sortedProblems.length === 0 && !problemsLoading && !problemsError && problems.length > 0 && (
              <div className="py-10 px-5 text-center">
                <div className="text-text-muted text-fs-14">
                  No problems match your filters.
                </div>
                <Button variant="ghost" onClick={clearFilters} className="mt-2">
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Delete problems"
        message={
          selectedIds.length === 1
            ? 'This permanently deletes the selected problem, including its solutions and FSRS review history. This cannot be undone.'
            : `This permanently deletes the ${selectedIds.length} selected problems, including their solutions and FSRS review history. This cannot be undone.`
        }
        confirmLabel="Delete"
        confirmVariant="red"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <CustomListsModal
        isOpen={isCustomListsModalOpen}
        target={modalTarget}
        problems={problems}
        customLists={customLists}
        onClose={() => {
          setIsCustomListsModalOpen(false);
          setModalTarget(null);
        }}
        onLoadCustomLists={onLoadCustomLists}
        onRefreshProblems={onRefreshProblems}
      />
    </div>
  );
}
