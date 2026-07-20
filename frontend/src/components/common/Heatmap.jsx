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
    const { startDate, endDate, days = {} } = activity || defaultRange(weeks);
    const end = toDate(endDate);
    const maxCount = Math.max(
      1,
      ...Object.values(days).map(({ reviews = 0, solves = 0 }) => reviews + solves)
    );

    // Month-segmented columns: a new column starts on each Sunday and on the
    // 1st of each month, so a week straddling a month boundary is split into
    // two partial columns and every column holds days of a single month.
    // Cells sit at their weekday row; the unused rows stay null (transparent).
    const columns = [];
    let column = null;
    const cursor = toDate(startDate);
    while (cursor <= end) {
      const dow = cursor.getUTCDay();
      if (!column || dow === 0 || cursor.getUTCDate() === 1) {
        column = Array(7).fill(null);
        columns.push(column);
      }
      const iso = toIso(cursor);
      const { reviews = 0, solves = 0 } = days[iso] || {};
      const count = reviews + solves;
      const opacity =
        count === 0
          ? EMPTY_OPACITY
          : LEVEL_OPACITIES[Math.min(3, Math.ceil((count / maxCount) * 4) - 1)];
      column[dow] = {
        date: iso,
        reviews,
        solves,
        count,
        color: `rgba(${colorBase}, ${opacity})`,
      };
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return columns;
  }, [activity, weeks, colorBase]);

  // Every column holds days of a single month. Each month's first column
  // carries a label along with the block's column count, so the text can be
  // centered across the whole block. Skip a cramped first label whose lone
  // leading column would collide with the next month's label.
  const monthLabels = useMemo(() => {
    const monthOf = (column) => toDate(column.find(Boolean).date).getUTCMonth();
    const labels = grid.map(() => null);
    let start = 0;
    for (let i = 1; i <= grid.length; i++) {
      if (i === grid.length || monthOf(grid[i]) !== monthOf(grid[start])) {
        labels[start] = { text: MONTHS[monthOf(grid[start])], span: i - start };
        start = i;
      }
    }
    if (labels[0] && labels[0].span < 2 && grid.length > 1) labels[0] = null;
    return labels;
  }, [grid]);

  // Extra space before each month's first column, so months read as blocks.
  // Applied to the label row and the grid alike to keep columns aligned.
  const monthGap = (i) => (i > 0 && monthLabels[i] ? ' ml-sp-10' : '');

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
      {/* Fluid columns (flex-1) so the whole year fits the card without
          scrolling; the min-width only kicks in on very narrow screens. */}
      <div className="min-w-[640px]">
        <div className="flex gap-sp-3 mb-1.5">
          {/* Space before ${} keeps Tailwind's scanner extracting h-sp-10 */}
          {monthLabels.map((label, i) => (
            <div key={i} className={`relative flex-1 min-w-0 h-sp-10 ${monthGap(i)}`}>
              {label && (
                <span
                  className="absolute left-0 top-0 text-center font-mono text-fs-10 text-text-muted leading-none whitespace-nowrap"
                  style={{ width: `calc(${label.span * 100}% + ${(label.span - 1) * 3}px)` }}
                >
                  {label.text}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-sp-3" onMouseLeave={() => setTip(null)}>
          {grid.map((column, cIdx) => (
            <div key={cIdx} className={`flex flex-col flex-1 min-w-0 gap-sp-3 ${monthGap(cIdx)}`}>
              {column.map((cell, dIdx) => (
                <div
                  key={dIdx}
                  className="w-full aspect-square rounded-sm transition-colors duration-300"
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
