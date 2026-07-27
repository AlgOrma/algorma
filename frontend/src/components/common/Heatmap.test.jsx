import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Heatmap from './Heatmap';

// The component paints day cells as `rgba(<colorBase>, <opacity>)` and unused
// weekday rows as `transparent`. We classify cells by that inline color rather
// than class names, and read the alpha channel to check intensity buckets.
const CELL_COLOR = /^rgba\(111,\s*191,\s*146,\s*([\d.]+)\)$/;

const opacityOf = (el) => {
  const match = el.style.backgroundColor.match(CELL_COLOR);
  return match ? Number(match[1]) : null;
};

// DOM shape: scroll wrapper > inner wrapper > [labels row, grid row].
const getColumns = (container) => {
  const gridRow = container.firstChild.firstChild.children[1];
  return Array.from(gridRow.children).map((col) => Array.from(col.children));
};

const getDayCells = (container) =>
  getColumns(container)
    .flat()
    .filter((el) => opacityOf(el) !== null);

// 2026-03-01 is a Sunday and 2026-03-28 a Saturday: four exact weeks inside a
// single month, so day cells appear in strict date order (index 0 = Mar 1).
const marchActivity = (days = {}) => ({
  startDate: '2026-03-01',
  endDate: '2026-03-28',
  days,
});

describe('Heatmap', () => {
  describe('day cells', () => {
    it('renders one cell per day of the activity range', () => {
      const { container } = render(<Heatmap activity={marchActivity()} />);

      expect(getColumns(container)).toHaveLength(4);
      expect(getDayCells(container)).toHaveLength(28);
    });

    it('renders days missing from the payload at the empty intensity', () => {
      const { container } = render(<Heatmap activity={marchActivity()} />);

      const opacities = getDayCells(container).map(opacityOf);
      expect(opacities).toEqual(Array(28).fill(0.06));
    });

    it('renders an empty grid when the payload omits the days map entirely', () => {
      // Without a default, `Object.values(undefined)` throws and takes the
      // whole dashboard down — a harder failure than the miscoloured cells
      // the missing-count defaults guard against.
      const { container } = render(
        <Heatmap activity={{ startDate: '2026-03-01', endDate: '2026-03-28' }} />
      );

      expect(getDayCells(container)).toHaveLength(28);
      expect(getDayCells(container).map(opacityOf)).toEqual(Array(28).fill(0.06));
    });

    it('renders a day present in the payload with zero counts at the empty intensity', () => {
      const { container } = render(
        <Heatmap activity={marchActivity({ '2026-03-10': { reviews: 0, solves: 0 } })} />
      );

      // Mar 10 is the 10th day of the range, so index 9.
      expect(opacityOf(getDayCells(container)[9])).toBe(0.06);
    });

    it('maps counts onto the four intensity buckets relative to the busiest day', () => {
      const { container } = render(
        <Heatmap
          activity={marchActivity({
            '2026-03-02': { reviews: 0, solves: 8 }, // 8/8 -> bucket 4
            '2026-03-03': { reviews: 1, solves: 0 }, // 1/8 -> bucket 1 (fractional ratio rounds up)
            '2026-03-04': { reviews: 4, solves: 0 }, // 4/8 -> bucket 2
            '2026-03-05': { reviews: 1, solves: 5 }, // 6/8 -> bucket 3
          })}
        />
      );

      const cells = getDayCells(container);
      expect(opacityOf(cells[1])).toBe(0.88);
      expect(opacityOf(cells[2])).toBe(0.1);
      expect(opacityOf(cells[3])).toBe(0.34);
      expect(opacityOf(cells[4])).toBe(0.58);
    });
  });

  describe('column layout', () => {
    it('pads unused weekday rows with transparent placeholders when the range starts mid-week', () => {
      // 2026-03-04 is a Wednesday, 2026-03-10 a Tuesday: two partial weeks.
      const { container } = render(
        <Heatmap activity={{ startDate: '2026-03-04', endDate: '2026-03-10', days: {} }} />
      );

      const columns = getColumns(container);
      expect(columns).toHaveLength(2);
      expect(getDayCells(container)).toHaveLength(7);

      // First column: Sun-Tue rows empty, Wed-Sat filled.
      expect(columns[0].map((cell) => opacityOf(cell) !== null)).toEqual([
        false, false, false, true, true, true, true,
      ]);
      // Second column: Sun-Tue filled, Wed-Sat empty.
      expect(columns[1].map((cell) => opacityOf(cell) !== null)).toEqual([
        true, true, true, false, false, false, false,
      ]);
    });

    it('splits a week straddling a month boundary into two partial columns', () => {
      // 2026-03-15 (Sun) .. 2026-04-11 (Sat); Apr 1 falls on a Wednesday.
      const { container } = render(
        <Heatmap activity={{ startDate: '2026-03-15', endDate: '2026-04-11', days: {} }} />
      );

      const columns = getColumns(container);
      const daysPerColumn = columns.map(
        (col) => col.filter((cell) => opacityOf(cell) !== null).length
      );
      // Two full March weeks, Mar 29-31, Apr 1-4, one full April week.
      expect(daysPerColumn).toEqual([7, 7, 3, 4, 7]);
    });
  });

  describe('month labels', () => {
    it('labels a single-month range exactly once', () => {
      render(<Heatmap activity={marchActivity()} />);

      expect(screen.getAllByText('Mar')).toHaveLength(1);
    });

    it('labels each month block once when the range spans two months', () => {
      render(
        <Heatmap activity={{ startDate: '2026-03-15', endDate: '2026-04-11', days: {} }} />
      );

      expect(screen.getAllByText('Mar')).toHaveLength(1);
      expect(screen.getAllByText('Apr')).toHaveLength(1);
    });

    it('drops a cramped first label whose month spans a single column', () => {
      // Mar 29-31 occupy one lone column before April begins.
      render(
        <Heatmap activity={{ startDate: '2026-03-29', endDate: '2026-04-04', days: {} }} />
      );

      expect(screen.queryByText('Mar')).not.toBeInTheDocument();
      expect(screen.getByText('Apr')).toBeInTheDocument();
    });

    it('keeps a single-column label when the whole range fits one column', () => {
      // Mar 29-31 alone: the label spans one column, but with no neighboring
      // month to collide with it must not be dropped.
      render(
        <Heatmap activity={{ startDate: '2026-03-29', endDate: '2026-03-31', days: {} }} />
      );

      expect(screen.getByText('Mar')).toBeInTheDocument();
    });
  });

  describe('fallback range when activity has not loaded', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('renders the requested number of Sunday-aligned empty weeks ending today', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      // Local noon keeps the local calendar date equal to the UTC date.
      vi.setSystemTime(new Date(2026, 2, 28, 12, 0, 0)); // Sat Mar 28 2026

      const { container } = render(<Heatmap weeks={4} />);

      // Four weeks ending Sat Mar 28 start on Sun Mar 1.
      const cells = getDayCells(container);
      expect(cells).toHaveLength(28);
      expect(cells.map(opacityOf)).toEqual(Array(28).fill(0.06));
      expect(screen.getByText('Mar')).toBeInTheDocument();
    });

    it('aligns the fallback start to a Sunday when today falls mid-week', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 2, 25, 12, 0, 0)); // Wed Mar 25 2026

      const { container } = render(<Heatmap weeks={4} />);

      // The final week is cut short at Wednesday: the range starts on Sun
      // Mar 1, not a flat 28 days back from today.
      const columns = getColumns(container);
      expect(columns).toHaveLength(4);
      expect(getDayCells(container)).toHaveLength(25);
      expect(columns[3].map((cell) => opacityOf(cell) !== null)).toEqual([
        true, true, true, true, false, false, false,
      ]);
    });
  });

  describe('tooltip', () => {
    const activeDays = {
      '2026-03-04': { reviews: 4, solves: 0 },
      '2026-03-05': { reviews: 1, solves: 5 },
    };

    it('shows combined counts and the formatted date for an active day on hover', async () => {
      const user = userEvent.setup();
      const { container } = render(<Heatmap activity={marchActivity(activeDays)} />);

      await user.hover(getDayCells(container)[4]); // Mar 5

      expect(screen.getByText('5 solved · 1 review')).toBeInTheDocument();
      expect(screen.getByText('Thu, Mar 5, 2026')).toBeInTheDocument();
    });

    it('pluralizes review counts above one', async () => {
      const user = userEvent.setup();
      const { container } = render(<Heatmap activity={marchActivity(activeDays)} />);

      await user.hover(getDayCells(container)[3]); // Mar 4

      expect(screen.getByText('4 reviews')).toBeInTheDocument();
    });

    it('shows "No activity" for a day with no recorded work', async () => {
      const user = userEvent.setup();
      const { container } = render(<Heatmap activity={marchActivity(activeDays)} />);

      await user.hover(getDayCells(container)[0]); // Mar 1

      expect(screen.getByText('No activity')).toBeInTheDocument();
    });

    it('hides the tooltip when the pointer leaves the cell', async () => {
      const user = userEvent.setup();
      const { container } = render(<Heatmap activity={marchActivity(activeDays)} />);

      const cell = getDayCells(container)[3];
      await user.hover(cell);
      await user.unhover(cell);

      expect(screen.queryByText('4 reviews')).not.toBeInTheDocument();
    });

    it('treats a missing count field as zero in cell coloring and tooltip text', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <Heatmap
          activity={{
            startDate: '2026-03-01',
            endDate: '2026-03-07',
            days: { '2026-03-02': { solves: 3 } }, // no `reviews` key
          }}
        />
      );

      // Mar 2 is the range's only (and thus busiest) day, so it takes the
      // top intensity bucket despite the missing `reviews` field.
      const cell = getDayCells(container)[1]; // Mar 2
      expect(opacityOf(cell)).toBe(0.88);

      await user.hover(cell);
      expect(screen.getByText('3 solved')).toBeInTheDocument();
    });
  });
});
