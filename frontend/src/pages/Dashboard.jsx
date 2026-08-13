import React, { useState, useEffect, useRef } from 'react';
import Heatmap from '../components/common/Heatmap';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import { getActivity } from '../api';

// Time-of-day greeting word
function greetingWord() {
  const h = new Date().getHours();
  return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

// Shimmering placeholder while a stat value is loading.
function StatSkeleton({ className = 'w-14 h-7' }) {
  return <span className={`lc-skeleton inline-block align-middle ${className}`} aria-hidden="true" />;
}

export default function Dashboard({
  problems = [],
  problemsLoading = false,
  problemsError = false,
  onRetryProblems,
  topics = [],
  userName,
  userId,
  dailyGoal = 10,
  stats = null,
  statsError = false,
  onRetryStats,
  onNavigate,
  onOpenProblem
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);

  const [activity, setActivity] = useState(null);
  const [activityError, setActivityError] = useState(false);
  const [activityRetryTick, setActivityRetryTick] = useState(0);

  // The activity endpoint is user-scoped, so it waits for a profile and refetches
  // when that profile changes. The cancelled flag drops a previous profile's
  // response if one is still in flight, so a switch can't leave someone else's
  // heatmap on screen.
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    setActivityError(false);
    getActivity()
      .then((data) => { if (!cancelled) setActivity(data); })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Could not load activity:', err.message);
        setActivityError(true);
      });
    return () => { cancelled = true; };
  }, [userId, activityRetryTick]);

  // ⌘K / Ctrl+K focuses the search field (the badge advertises it).
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // The problem list is the single source of truth for what's due: the header
  // count, the DUE TODAY card, the queue rows, and the Start button all derive
  // from it, so they can never disagree on one viewport.
  const dueList = problems.filter(p => p.due);
  const dueCount = dueList.length;
  const overdueCount = problems.filter(p => p.overdue).length;
  const totalSolved = problems.filter(p => p.status === 'Done').length;

  const statsLoading = !stats && !statsError;
  const solvedDisplay = stats ? stats.totalSolved : totalSolved;
  const activityTotal = activity ? (activity.totalSolves || 0) + (activity.totalReviews || 0) : 0;

  const submitSearch = () => onNavigate('problems', { query: searchQuery });

  const now = new Date();
  const problemsWord = dueCount === 1 ? 'problem' : 'problems';

  // Daily-goal gauge: today's solves + reviews against the profile goal.
  // Activity days are keyed by the user's LOCAL calendar (api.js sends
  // tzOffset and the backend buckets by it), so today's key must be local too.
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayEntry = activity?.days?.[todayIso];
  const todayCount = todayEntry ? (todayEntry.reviews || 0) + (todayEntry.solves || 0) : 0;
  const goalMet = activity && dailyGoal > 0 && todayCount >= dailyGoal;

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1140px] mx-auto px-sp-30 pt-sp-26 pb-10 flex flex-col gap-sp-18">
      {/* Header section */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-fs-23 font-bold text-text-main tracking-[-0.015em] text-left">
            {userName ? `${greetingWord()}, ${userName}` : greetingWord()}
          </div>
          <div className="font-mono text-fs-12-5 text-text-muted mt-sp-5 text-left">
            {now.toLocaleDateString('en-US', { weekday: 'short' })} · {now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            &nbsp;·&nbsp; <span className="text-accent-text">{dueCount} {problemsWord}</span> due for review
            {activity && dailyGoal > 0 && (
              <>
                &nbsp;·&nbsp;
                <span className={goalMet ? 'text-accent-green' : undefined} title="Today's solves and reviews against your daily goal">
                  {todayCount}/{dailyGoal} today{goalMet ? ' ✓' : ''}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-2.5 items-center">
          {/* Search box */}
          <div className="lc-search flex items-center gap-2 bg-bg-card border border-border-main rounded-card-btn px-3 py-sp-9 w-sp-210">
            <button
              type="button"
              aria-label="Search"
              onClick={submitSearch}
              className="flex-none flex items-center cursor-pointer bg-transparent p-0"
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <circle cx="9" cy="9" r="6" />
                <line x1="13.5" y1="13.5" x2="17" y2="17" />
              </svg>
            </button>
            <input
              ref={searchInputRef}
              type="text"
              aria-label="Search problems"
              placeholder="Search problems"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(); }}
              className="bg-transparent border-none outline-none text-text-main text-fs-13 w-full p-0"
            />
            <span className="font-mono text-fs-11 text-text-muted" aria-hidden="true">
              {IS_MAC ? '⌘K' : 'Ctrl K'}
            </span>
          </div>

          <Button onClick={() => onNavigate('leetcode')}>
            <span className="text-fs-16 leading-[0] mt-[-1px]">+</span> New problem
          </Button>
        </div>
      </div>

      {/* Fetch failures: say so instead of presenting zeros as truth */}
      {problemsError && (
        <div role="status" className="flex items-center gap-3 bg-bg-card border border-border-main rounded-card-md px-sp-14 py-sp-9 font-mono text-fs-12 text-text-muted">
          Couldn't load your problems — solved and due counts may be out of date.
          <button
            type="button"
            onClick={onRetryProblems}
            className="font-mono text-fs-12 text-accent-text cursor-pointer bg-transparent p-0 hover:underline"
          >
            Try again
          </button>
        </div>
      )}
      {statsError && (
        <div role="status" className="flex items-center gap-3 bg-bg-card border border-border-main rounded-card-md px-sp-14 py-sp-9 font-mono text-fs-12 text-text-muted">
          Couldn't load stats — streak and retention may be out of date.
          <button
            type="button"
            onClick={onRetryStats}
            className="font-mono text-fs-12 text-accent-text cursor-pointer bg-transparent p-0 hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-sp-13">
        <div className="bg-bg-card border border-border-card rounded-xl py-sp-15 px-sp-16 text-left">
          <div className="font-mono text-fs-10-5 text-text-muted tracking-[0.05em]">
            TOTAL SOLVED
          </div>
          <div className="font-mono text-fs-31 font-semibold text-text-main mt-sp-9 leading-none">
            {!stats && problemsLoading ? <StatSkeleton /> : solvedDisplay}
          </div>
          <div className={`text-fs-12 mt-sp-9 ${stats && stats.solvedThisWeek > 0 ? 'text-accent-green-hover' : 'text-text-muted'}`}>
            {stats
              ? (stats.solvedThisWeek > 0 ? `▲ ${stats.solvedThisWeek} this week` : 'none yet this week')
              : statsLoading ? <StatSkeleton className="w-16 h-3" /> : '— this week'}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('revise')}
          title="Problems the FSRS spaced-repetition scheduler has queued for review"
          className="bg-bg-card ring-1 ring-accent/28 rounded-xl py-sp-15 px-sp-16 cursor-pointer text-left w-full hover:ring-accent/50 transition-[box-shadow] duration-200"
        >
          <span className="block font-mono text-fs-10-5 text-accent-text tracking-[0.05em]">
            DUE TODAY
          </span>
          <span className="block font-mono text-fs-31 font-semibold text-accent-text mt-sp-9 leading-none">
            {problemsLoading ? <StatSkeleton /> : dueCount}
          </span>
          <span className="block text-fs-12 text-text-muted mt-sp-9">
            {problemsLoading ? <StatSkeleton className="w-16 h-3" /> : overdueCount > 0 ? `${overdueCount} overdue` : ' '}
          </span>
          <span className="sr-only">Scheduled by the FSRS spaced-repetition algorithm. Opens the revision session.</span>
        </button>

        <div className="bg-bg-card border border-border-card rounded-xl py-sp-15 px-sp-16 text-left">
          <div className="font-mono text-fs-10-5 text-text-muted tracking-[0.05em]">
            STREAK
          </div>
          <div className="font-mono text-fs-31 font-semibold text-text-main mt-sp-9 leading-none">
            {statsLoading ? <StatSkeleton /> : stats ? <>{stats.streakDays}<span className="text-fs-15 text-text-muted">d</span></> : '—'}
          </div>
          <div className="text-fs-12 text-text-muted mt-sp-9">
            {statsLoading ? <StatSkeleton className="w-16 h-3" /> : stats ? `best · ${stats.bestStreakDays}d` : 'unavailable'}
          </div>
        </div>

        <div
          className="bg-bg-card border border-border-card rounded-xl py-sp-15 px-sp-16 text-left"
          title="Share of your recent reviews you recalled successfully"
        >
          <div className="font-mono text-fs-10-5 text-text-muted tracking-[0.05em]">
            RETENTION
          </div>
          <div className="font-mono text-fs-31 font-semibold text-text-main mt-sp-9 leading-none">
            {statsLoading ? <StatSkeleton /> : stats ? <>{stats.retentionPct}<span className="text-fs-15 text-text-muted">%</span></> : '—'}
          </div>
          <div className="text-fs-12 text-text-muted mt-sp-9">
            of last 60 reviews recalled
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
          <div className="flex items-center gap-1.5 font-mono text-fs-10 text-text-muted" aria-hidden="true">
            less
            <span className="w-2.5 h-2.5 rounded-sm bg-accent-green-hover/18"></span>
            <span className="w-2.5 h-2.5 rounded-sm bg-accent-green-hover/34"></span>
            <span className="w-2.5 h-2.5 rounded-sm bg-accent-green-hover/58"></span>
            <span className="w-2.5 h-2.5 rounded-sm bg-accent-green-hover/88"></span>
            more
          </div>
        </div>
        {activityError ? (
          <div role="status" className="py-sp-20 text-center font-mono text-fs-12 text-text-muted">
            Couldn't load activity —{' '}
            <button
              type="button"
              onClick={() => setActivityRetryTick((t) => t + 1)}
              className="font-mono text-fs-12 text-accent-text cursor-pointer bg-transparent p-0 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : !activity ? (
          <span className="lc-skeleton block h-[120px]" aria-hidden="true" />
        ) : (
          <Heatmap colorBase="5, 150, 105" activity={activity} />
        )}
      </div>

      {/* Main split sections */}
      <div className="flex flex-col min-[900px]:flex-row gap-4 min-[900px]:items-start">

        {/* Left: Due for revision */}
        <div className="flex-[1.55_1.55_0%] bg-bg-card border border-border-card rounded-xl py-sp-18 px-sp-20 flex flex-col min-w-0 text-left">
          <div className="flex items-center justify-between mb-1">
            <div className="text-fs-14-5 font-semibold text-text-main">Due for revision today</div>
            <a
              href="/problems"
              onClick={(e) => { e.preventDefault(); onNavigate('problems'); }}
              className="font-mono text-fs-12 text-accent-text cursor-pointer hover:underline"
            >
              All problems →
            </a>
          </div>

          <div className="flex flex-col">
            {dueList.slice(0, 5).map((row) => (
              <a
                key={row.id}
                href={`/problems/${row.id}`}
                onClick={(e) => { e.preventDefault(); onOpenProblem(row.id); }}
                className="flex items-center gap-3 py-3 px-0.5 border-b border-bg-element-dark cursor-pointer hover:bg-bg-element-hover transition-all duration-200"
              >
                <span className="flex-1 min-w-0 block">
                  <span className="block text-fs-14 font-semibold text-text-main truncate">{row.title}</span>
                  <span className="flex gap-2 items-center mt-sp-5">
                    <span className="font-mono text-fs-11 text-text-hover bg-bg-btn-sec border border-border-main px-sp-7 py-sp-1 rounded-md">
                      {row.topic}
                    </span>
                    <span className={`font-mono text-fs-11 ${row.overdue ? 'text-accent-red-text' : 'text-accent-green'}`}>
                      {row.dueMeta || 'due now'}
                    </span>
                  </span>
                </span>

                <Badge type="difficulty" value={row.difficulty} />
                <span className="text-text-muted text-fs-16 ml-1" aria-hidden="true">→</span>
              </a>
            ))}

            {dueCount > 5 && (
              <div className="font-mono text-fs-11 text-text-muted mt-2">
                +{dueCount - 5} more in the session
              </div>
            )}

            {/* The empty queue means four different things — loading, fetch
                failure, brand-new account, and genuinely done. Only the last
                one earns the celebration. */}
            {dueCount === 0 && problemsLoading && (
              <div className="flex flex-col gap-2 py-3">
                <span className="lc-skeleton block h-10" aria-hidden="true" />
                <span className="lc-skeleton block h-10" aria-hidden="true" />
                <span className="lc-skeleton block h-10" aria-hidden="true" />
              </div>
            )}
            {dueCount === 0 && !problemsLoading && problemsError && (
              <div className="py-sp-30 text-center font-mono text-fs-12 text-text-muted">
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
            {dueCount === 0 && !problemsLoading && !problemsError && problems.length === 0 && (
              <div className="py-sp-30 text-center">
                <div className="text-text-muted text-fs-14">No problems yet.</div>
                <div className="text-fs-12-5 text-text-muted mt-sp-5">
                  Import your first from the LeetCode catalog to start practicing.
                </div>
                <Button onClick={() => onNavigate('leetcode')} className="mt-3">
                  Browse LeetCode catalog
                </Button>
              </div>
            )}
            {dueCount === 0 && !problemsLoading && !problemsError && problems.length > 0 && (
              <div className="py-sp-30 text-center text-text-muted text-fs-14">
                All caught up! Nothing due today.
              </div>
            )}
          </div>

          {!(problems.length === 0 && !problemsLoading && !problemsError) && (
            <Button
              onClick={() => onNavigate('revise')}
              className="mt-4 w-full py-sp-11"
              disabled={dueCount === 0}
            >
              {dueCount === 0
                ? 'Start revision session'
                : `Start revision session · ${dueCount} ${problemsWord}`}
            </Button>
          )}
        </div>

        {/* Right: Topic mastery */}
        <div className="flex-1 flex flex-col gap-sp-14 min-w-0">

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
                  <div className="h-sp-7 bg-bg-track rounded overflow-hidden">
                    <div
                      className="h-full bg-accent rounded transition-all duration-500 ease-out"
                      style={{
                        width: `${t.pct}%`
                      }}
                    />
                  </div>
                </div>
              ))}
              {topics.length > 6 && (
                <div className="font-mono text-fs-11 text-text-muted">
                  +{topics.length - 6} more topics
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
      </div>
    </div>
  );
}
