import React, { useState, useMemo, useEffect } from 'react';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';

export default function ProblemBank({
  problems = [],
  onOpenProblem,
  onOpenNewProblemModal,
  initialSearchQuery = ''
}) {
  const [search, setSearch] = useState(initialSearchQuery);
  const [selectedTopic, setSelectedTopic] = useState('All');
  const [selectedDiff, setSelectedDiff] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [dueOnly, setDueOnly] = useState(false);

  // Sync initial search query if redirected from dashboard search
  useEffect(() => {
    if (initialSearchQuery) {
      setSearch(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  // Extract unique values for filter dropdowns
  const uniqueTopics = useMemo(() => {
    const topics = new Set(problems.map(p => p.topic));
    return ['All', ...Array.from(topics)];
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
      
      const matchesDue = !dueOnly || p.due;

      return matchesSearch && matchesTopic && matchesDiff && matchesStatus && matchesDue;
    });
  }, [problems, search, selectedTopic, selectedDiff, selectedStatus, dueOnly]);

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1140px] mx-auto px-sp-30 pt-sp-26 pb-10 flex flex-col gap-4">
      {/* Header section */}
      <div className="flex items-center justify-between">
        <div className="text-left">
          <div className="text-fs-21 font-bold text-text-main tracking-[-0.015em]">
            Problem bank
          </div>
          <div className="font-mono text-fs-12 text-text-muted mt-1">
            {problems.length} problems · replaces the DSA Prep PDF
          </div>
        </div>
        
        <Button onClick={onOpenNewProblemModal}>
          <span className="text-fs-16 leading-[0] mt-[-1px]">+</span> New problem
        </Button>
      </div>

      {/* Filter and search bar */}
      <div className="flex items-center gap-sp-9 flex-wrap">
        
        {/* Search input */}
        <div className="flex items-center gap-2 bg-bg-card border border-border-main rounded-card-btn px-3 py-2 w-sp-230">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--color-border-accent)" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="9" cy="9" r="6" />
            <line x1="13.5" y1="13.5" x2="17" y2="17" />
          </svg>
          <input
            type="text"
            placeholder="Search title or topic…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none text-text-main text-fs-13 w-full p-0"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex gap-1.5">
          {/* Topic filter */}
          <select
            value={selectedTopic}
            onChange={(e) => setSelectedTopic(e.target.value)}
            className="text-fs-12-5 text-text-hover bg-bg-card border border-border-main rounded-card-btn px-3 py-2 cursor-pointer outline-none transition-colors duration-200 focus:border-accent"
          >
            <option value="All">Topic: All</option>
            {uniqueTopics.filter(t => t !== 'All').map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Difficulty filter */}
          <select
            value={selectedDiff}
            onChange={(e) => setSelectedDiff(e.target.value)}
            className="text-fs-12-5 text-text-hover bg-bg-card border border-border-main rounded-card-btn px-3 py-2 cursor-pointer outline-none transition-colors duration-200 focus:border-accent"
          >
            <option value="All">Difficulty: All</option>
            {uniqueDiffs.filter(d => d !== 'All').map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-fs-12-5 text-text-hover bg-bg-card border border-border-main rounded-card-btn px-3 py-2 cursor-pointer outline-none transition-colors duration-200 focus:border-accent"
          >
            <option value="All">Status: All</option>
            {uniqueStatuses.filter(s => s !== 'All').map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Due Switch */}
        <div 
          onClick={() => setDueOnly(!dueOnly)} 
          className="flex items-center gap-sp-9 cursor-pointer text-fs-12-5 text-text-hover bg-bg-card border border-border-main rounded-card-btn px-3 py-2 ml-auto select-none"
        >
          {/* Toggle pill */}
          <span className={`w-sp-30 h-sp-17 rounded-card-btn flex items-center p-sp-2 transition-all duration-150 ${dueOnly ? 'bg-accent justify-end' : 'bg-border-btn justify-start'}`}>
            <span className="w-sp-13 h-sp-13 rounded-full bg-text-dark"></span>
          </span>
          Due for revision
        </div>

      </div>

      {/* Problems Bank List Grid */}
      <div className="bg-bg-card border border-border-card rounded-xl overflow-hidden flex flex-col">
        {/* Table Header */}
        <div className="grid grid-cols-[2.1fr_0.95fr_62px_116px_96px_78px] gap-3 px-sp-18 py-sp-11 border-b border-border-muted font-mono text-fs-9-5 text-border-accent tracking-[0.06em] text-left">
          <span>TITLE</span>
          <span>TOPIC</span>
          <span>DIFF</span>
          <span>STATUS</span>
          <span>LAST REV</span>
          <span className="text-right">NEXT</span>
        </div>

        {/* Table Rows */}
        <div className="flex flex-col">
          {filteredProblems.map((row) => (
            <div 
              key={row.id} 
              onClick={() => onOpenProblem(row.id)} 
              className="grid grid-cols-[2.1fr_0.95fr_62px_116px_96px_78px] gap-3 items-center px-sp-18 py-3 border-b border-bg-element-dark cursor-pointer text-left hover:bg-bg-element-hover transition-colors duration-150"
            >
              <span className="text-fs-13-5 text-text-main font-medium truncate">
                {row.title}
              </span>
              <span className="font-mono text-fs-11-5 text-text-hover truncate">
                {row.topic}
              </span>
              
              <Badge type="difficulty" value={row.difficulty} />
              <Badge type="status" value={row.status} />

              <span className="font-mono text-fs-11 text-text-muted">
                {row.lastRevised || '—'}
              </span>
              <span className={`font-mono text-fs-11 text-right ${row.due ? 'text-accent' : 'text-text-muted'}`}>
                {row.due ? 'today' : row.nextLabel || '—'}
              </span>
            </div>
          ))}

          {filteredProblems.length === 0 && (
            <div className="py-10 px-5 text-text-muted text-fs-14 text-center">
              No problems matches your search filters.
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
