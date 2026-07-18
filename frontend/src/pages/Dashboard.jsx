import React, { useState, useEffect } from 'react';
import Heatmap from '../components/common/Heatmap';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import { getStats, getActivity } from '../api';

// Time-of-day greeting word
function greetingWord() {
  const h = new Date().getHours();
  return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
}

export default function Dashboard({
  problems = [],
  topics = [],
  userName,
  onNavigate,
  onOpenProblem
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState(null);
  useEffect(() => {
    getStats()
      .then(setStats)
      .catch((err) => console.warn('Could not load stats:', err.message));
    getActivity()
      .then(setActivity)
      .catch((err) => console.warn('Could not load activity:', err.message));
  }, []);

  // Derived (fallback) statistics
  const totalSolved = problems.filter(p => p.status === 'Done').length;
  const dueList = problems.filter(p => p.due);
  const dueCount = dueList.length;

  const solvedDisplay = stats ? stats.totalSolved : totalSolved;
  const dueDisplay = stats ? (stats.dueToday || 0) + (stats.overdue || 0) : dueCount;
  const activityTotal = activity ? (activity.totalSolves || 0) + (activity.totalReviews || 0) : 0;

  const handleSearchSubmit = (e) => {
    if (e.key === 'Enter' || e.type === 'click') {
      onNavigate('problems', { query: searchQuery });
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1140px] mx-auto px-sp-30 pt-sp-26 pb-10 flex flex-col gap-sp-18">
      {/* Header section */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-fs-23 font-bold text-text-main tracking-[-0.015em] text-left">
            {greetingWord()}, {userName || 'there'}
          </div>
          <div className="font-mono text-fs-12-5 text-text-muted mt-sp-5 text-left">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', ' ·')} &nbsp;·&nbsp; <span className="text-accent">{dueCount} cards</span> due for review
          </div>
        </div>
        
        <div className="flex gap-2.5 items-center">
          {/* Search box */}
          <div className="flex items-center gap-2 bg-bg-card border border-border-main rounded-card-btn px-3 py-sp-9 w-sp-210">
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--color-border-accent)" strokeWidth="1.7" strokeLinecap="round">
              <circle cx="9" cy="9" r="6" />
              <line x1="13.5" y1="13.5" x2="17" y2="17" />
            </svg>
            <input
              type="text"
              placeholder="Search problems"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchSubmit}
              className="bg-transparent border-none outline-none text-text-main text-fs-13 w-full p-0"
            />
            <span className="font-mono text-fs-11 text-border-btn-hover">⌘K</span>
          </div>
          
          <Button onClick={() => onNavigate('leetcode')}>
            <span className="text-fs-16 leading-[0] mt-[-1px]">+</span> New problem
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-sp-13">
        <div className="bg-bg-card border border-border-card rounded-xl py-sp-15 px-sp-16 text-left">
          <div className="font-mono text-fs-10-5 text-text-muted tracking-[0.05em]">
            TOTAL SOLVED
          </div>
          <div className="font-mono text-fs-31 font-semibold text-text-main mt-sp-9 leading-none">
            {solvedDisplay}
          </div>
          <div className="text-fs-12 text-accent-green-hover mt-sp-9">
            ▲ {stats ? stats.solvedThisWeek : 0} this week
          </div>
        </div>

        <div 
          onClick={() => onNavigate('revise')}
          className="bg-bg-card border border-accent/28 rounded-xl py-sp-15 px-sp-16 cursor-pointer text-left hover:border-accent/50 transition-colors duration-200"
        >
          <div className="font-mono text-fs-10-5 text-accent tracking-[0.05em]">
            DUE TODAY
          </div>
          <div className="font-mono text-fs-31 font-semibold text-accent-blue mt-sp-9 leading-none">
            {dueDisplay}
          </div>
          <div className="text-fs-12 text-text-muted mt-sp-9">
            {stats ? stats.overdue : 0} overdue
          </div>
        </div>

        <div className="bg-bg-card border border-border-card rounded-xl py-sp-15 px-sp-16 text-left">
          <div className="font-mono text-fs-10-5 text-text-muted tracking-[0.05em]">
            STREAK
          </div>
          <div className="font-mono text-fs-31 font-semibold text-text-main mt-sp-9 leading-none">
            {stats ? stats.streakDays : 0}<span className="text-fs-15 text-text-muted">d</span>
          </div>
          <div className="text-fs-12 text-text-muted mt-sp-9">
            best · {stats ? stats.bestStreakDays : 0}d
          </div>
        </div>

        <div className="bg-bg-card border border-border-card rounded-xl py-sp-15 px-sp-16 text-left">
          <div className="font-mono text-fs-10-5 text-text-muted tracking-[0.05em]">
            RETENTION
          </div>
          <div className="font-mono text-fs-31 font-semibold text-text-main mt-sp-9 leading-none">
            {stats ? stats.retentionPct : 0}<span className="text-fs-15 text-text-muted">%</span>
          </div>
          <div className="text-fs-12 text-text-muted mt-sp-9">
            last 60 reviews
          </div>
        </div>
      </div>

      {/* Heatmap Section */}
      <div className="bg-bg-card border border-border-card rounded-xl p-4 px-sp-18 text-left">
        <div className="flex items-center justify-between mb-3">
          <div className="text-fs-14 font-semibold text-text-main">
            Review activity <span className="font-mono text-fs-11 text-text-muted font-normal">
              · {activity ? `${activityTotal} ${activityTotal === 1 ? 'activity' : 'activities'} in the ` : ''}past year
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-fs-10 text-text-muted">
            less
            <span className="w-2.5 h-2.5 rounded-sm bg-accent-green-hover/10"></span>
            <span className="w-2.5 h-2.5 rounded-sm bg-accent-green-hover/34"></span>
            <span className="w-2.5 h-2.5 rounded-sm bg-accent-green-hover/58"></span>
            <span className="w-2.5 h-2.5 rounded-sm bg-accent-green-hover/88"></span>
            more
          </div>
        </div>
        <Heatmap colorBase="111, 191, 146" activity={activity} />
      </div>

      {/* Main split sections */}
      <div className="flex gap-4 items-start">
        
        {/* Left: Due for revision */}
        <div className="flex-[1.55_1.55_0%] bg-bg-card border border-border-card rounded-xl py-sp-18 px-sp-20 flex flex-col min-w-0 text-left">
          <div className="flex items-center justify-between mb-1">
            <div className="text-fs-14-5 font-semibold text-text-main">Due for revision today</div>
            <span onClick={() => onNavigate('problems')} className="font-mono text-fs-12 text-accent cursor-pointer hover:underline">
              View all →
            </span>
          </div>

          <div className="flex flex-col">
            {dueList.slice(0, 5).map((row) => (
              <div 
                key={row.id} 
                onClick={() => onOpenProblem(row.id)} 
                className="flex items-center gap-3 py-3 px-0.5 border-b border-bg-element-dark cursor-pointer hover:bg-white/[0.01] transition-all duration-200"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-fs-14 font-semibold text-text-main">{row.title}</div>
                  <div className="flex gap-2 items-center mt-sp-5">
                    <span className="font-mono text-fs-11 text-text-hover bg-bg-btn-sec border border-border-main px-sp-7 py-sp-1 rounded-md">
                      {row.topic}
                    </span>
                    <span className={`font-mono text-fs-11 ${row.dueMeta?.includes('overdue') ? 'text-accent-red' : 'text-accent-green'}`}>
                      {row.dueMeta || 'due now'}
                    </span>
                  </div>
                </div>
                
                <Badge type="difficulty" value={row.difficulty} />
                <span className="text-border-accent text-fs-16 ml-1">→</span>
              </div>
            ))}

            {dueCount === 0 && (
              <div className="py-sp-30 text-center text-text-muted text-fs-14">
                All caught up! No revision due today.
              </div>
            )}
          </div>

          <Button 
            onClick={() => onNavigate('revise')} 
            className="mt-4 w-full py-sp-11"
            disabled={dueCount === 0}
          >
            Start revision session · {dueCount} cards
          </Button>
        </div>

        {/* Right: Topic mastery */}
        <div className="flex-1 display flex flex-col gap-sp-14 min-w-0">
          
          {/* Topic Mastery */}
          <div className="bg-bg-card border border-border-card rounded-xl py-sp-17 px-sp-18 text-left">
            <div className="text-fs-14 font-semibold text-text-main mb-3.5">
              Topic mastery
            </div>
            <div className="flex flex-col gap-sp-13">
              {topics.length === 0 && (
                <div className="text-fs-12-5 text-text-muted">
                  Solve problems to start tracking mastery by topic.
                </div>
              )}
              {topics.slice(0, 6).map((t, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-fs-12-5 mb-sp-6">
                    <span className="text-text-hover">{t.name}</span>
                    <span className="font-mono text-text-muted">{t.frac}</span>
                  </div>
                  <div className="height h-sp-7 bg-bg-track rounded overflow-hidden">
                    <div 
                      className="h-full bg-accent rounded transition-all duration-500 ease-out"
                      style={{ 
                        width: `${t.pct}%`
                      }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
      </div>
    </div>
  );
}
