// Static seed data has been removed for now — problems, flashcards, and topics
// all start empty. The template library is owned by the backend (seeded per
// user; see backend/app/seed.py STARTER_PATTERNS), not seeded here. The
// maps/lists below (DIFF_MAP, STATUS_MAP, GRADES) are UI config, not seed data,
// and must stay.
export const INITIAL_PROBLEMS = [];

export const INITIAL_CARDS = [];

export const INITIAL_TOPICS = [];

export const DIFF_MAP = {
  Easy: { c: 'var(--color-accent-green-hover)', bg: 'var(--color-badge-easy-bg)', bd: 'var(--color-badge-easy-border)', l: 'EASY' },
  Medium: { c: 'var(--color-accent-orange)', bg: 'var(--color-badge-medium-bg)', bd: 'var(--color-badge-medium-border)', l: 'MED' },
  Hard: { c: 'var(--color-accent-red-hover)', bg: 'var(--color-badge-hard-bg)', bd: 'var(--color-badge-hard-border)', l: 'HARD' }
};

export const STATUS_MAP = {
  'Done': { c: 'var(--color-accent-green-hover)', l: '● Done' },
  'Solving': { c: 'var(--color-accent-blue)', l: '◐ Solving' },
  'Not started': { c: 'var(--color-text-muted)', l: '○ Not started' }
};

export const GRADES = [
  { key: 'Again', c: 'var(--color-accent-red-hover)', iv: '<10 min' },
  { key: 'Hard', c: 'var(--color-accent-orange)', iv: '2 days' },
  { key: 'Good', c: 'var(--color-accent-green-hover)', iv: '6 days' },
  { key: 'Easy', c: 'var(--color-accent)', iv: '12 days' }
];

// Grade-button hint: prefer the card's per-grade FSRS preview (days until next
// due, from the backend's `nextIntervals`) over the static fallback label.
export const gradeIntervalLabel = (card, grade) => {
  const days = card?.nextIntervals?.[grade.key];
  if (days === undefined || days === null) return grade.iv;
  if (days === 0) return 'now';
  return days === 1 ? '1 day' : `${days} days`;
};
