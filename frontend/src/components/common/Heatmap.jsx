import React, { useEffect, useMemo, useRef, useState } from 'react';

// Legend opacities (match the "less … more" swatches on the dashboard).
const EMPTY_OPACITY = 0.06;
const LEVEL_OPACITIES = [0.1, 0.34, 0.58, 0.88];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const toIso = (d) => d.toISOString().slice(0, 10);

// Fallback range when activity hasn't loaded: `weeks` weeks ending today,
// aligned to a Sunday start like the backend's /stats/activity range.
function defaultRange(weeks) {
  const today = new Date();
  const end = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - end.getUTCDay() - (weeks - 1) * 7);
  return { startDate: toIso(start), endDate: toIso(end), days: {} };
}

function tooltipText(cell) {
  const parts = [];
  if (cell.solves) parts.push(`${cell.solves} solved`);
  if (cell.reviews) parts.push(`${cell.reviews} review${cell.reviews === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' · ') : 'No activity';
}

export default function Heatmap({ colorBase = '111, 191, 146', activity = null, weeks = 52 }) {
  const scrollRef = useRef(null);
  const [tip, setTip] = useState(null);

  const grid = useMemo(() => {
    const { startDate, endDate, days } = activity || defaultRange(weeks);
    const end = toDate(endDate);
    const maxCount = Math.max(
      1,
      ...Object.values(days).map((d) => d.reviews + d.solves)
    );

    const columns = [];
    const cursor = toDate(startDate);
    while (cursor <= end) {
      const column = [];
      for (let d = 0; d < 7; d++) {
        if (cursor > end) {
          // Days in the current week that haven't happened yet.
          column.push(null);
        } else {
          const iso = toIso(cursor);
          const { reviews = 0, solves = 0 } = days[iso] || {};
          const count = reviews + solves;
          const opacity =
            count === 0
              ? EMPTY_OPACITY
              : LEVEL_OPACITIES[Math.min(3, Math.ceil((count / maxCount) * 4) - 1)];
          column.push({
            date: iso,
            reviews,
            solves,
            count,
            color: `rgba(${colorBase}, ${opacity})`,
          });
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      columns.push(column);
    }
    return columns;
  }, [activity, weeks, colorBase]);

  // Label a column when its Sunday lands in a new month; skip a cramped first
  // label that would collide with the next month one column over.
  const monthLabels = useMemo(() => {
    const monthOf = (week) => toDate(week[0].date).getUTCMonth();
    return grid.map((week, i) => {
      const m = monthOf(week);
      if (i === 0) {
        return grid.length > 1 && monthOf(grid[1]) !== m ? '' : MONTHS[m];
      }
      return monthOf(grid[i - 1]) !== m ? MONTHS[m] : '';
    });
  }, [grid]);

  // Keep the most recent weeks in view when the grid overflows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [grid]);

  const showTip = (e, cell) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTip({ cell, x: rect.left + rect.width / 2, y: rect.top });
  };

  return (
    <div ref={scrollRef} className="overflow-x-auto custom-scrollbar">
      <div className="w-max">
        <div className="flex gap-sp-3 mb-1.5">
          {monthLabels.map((label, i) => (
            <div key={i} className="w-sp-13 shrink-0 font-mono text-fs-10 text-text-muted leading-none">
              <span className="whitespace-nowrap">{label}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-sp-3" onMouseLeave={() => setTip(null)}>
          {grid.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-sp-3">
              {week.map((cell, dIdx) => (
                <div
                  key={dIdx}
                  className="w-sp-13 h-sp-13 rounded-sm transition-colors duration-300"
                  style={{ backgroundColor: cell ? cell.color : 'transparent' }}
                  onMouseEnter={cell ? (e) => showTip(e, cell) : undefined}
                  onMouseLeave={() => setTip(null)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {tip && (
        <div
          className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full bg-bg-card border border-border-main rounded-md px-2.5 py-1.5 text-left shadow-lg"
          style={{ left: tip.x, top: tip.y - 7 }}
        >
          <div className="text-fs-12 text-text-main whitespace-nowrap">
            {tooltipText(tip.cell)}
          </div>
          <div className="font-mono text-fs-10 text-text-muted whitespace-nowrap mt-0.5">
            {toDate(tip.cell.date).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </div>
        </div>
      )}
    </div>
  );
}
