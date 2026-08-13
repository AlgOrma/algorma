import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FlashcardSession from './FlashcardSession';
import * as api from '../api';
import { UNASSIGNED_DECK } from '../data/initialData';

vi.mock('../api');

const card = (id, front) => ({
  id,
  front,
  back: `answer ${id}`,
  tag: 'dsa',
  type: 'concept',
  due: true,
  deckId: null,
  deckName: null,
  nextIntervals: { Again: 0, Hard: 2, Good: 6, Easy: 12 },
});

beforeEach(() => {
  vi.resetAllMocks();
});

async function startSession(cards, props = {}) {
  api.getFlashcards.mockResolvedValue(cards);
  render(<FlashcardSession deckId={null} onNavigate={vi.fn()} {...props} />);
  await screen.findByText(cards[0].front);
}

describe('FlashcardSession grade failures', () => {
  it('keeps the card on screen and shows an inline error when a grade fails', async () => {
    const user = userEvent.setup();
    await startSession([card('c1', 'first'), card('c2', 'second')]);

    await user.click(screen.getByRole('button', { name: /Show Answer/i }));
    api.reviewFlashcard.mockRejectedValue(new Error('offline'));
    await user.click(screen.getByRole('button', { name: /Good/ }));

    // The session survives: same card, still flipped, error shown inline.
    await screen.findByText('offline');
    expect(screen.getByText('answer c1')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Good/ })).toBeInTheDocument();
    expect(screen.queryByText('Session Unavailable')).not.toBeInTheDocument();
  });

  it('advances and clears the inline error once a retry succeeds', async () => {
    const user = userEvent.setup();
    await startSession([card('c1', 'first'), card('c2', 'second')]);

    await user.click(screen.getByRole('button', { name: /Show Answer/i }));
    api.reviewFlashcard.mockRejectedValueOnce(new Error('offline'));
    await user.click(screen.getByRole('button', { name: /Good/ }));
    await screen.findByText('offline');

    api.reviewFlashcard.mockResolvedValueOnce({});
    await user.click(screen.getByRole('button', { name: /Good/ }));

    await screen.findByText('second');
    expect(screen.queryByText('offline')).not.toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('still takes over the screen when the initial load fails', async () => {
    api.getFlashcards.mockRejectedValue(new Error('nope'));
    render(<FlashcardSession deckId={null} onNavigate={vi.fn()} />);

    expect(await screen.findByText('Session Unavailable')).toBeInTheDocument();
  });
});

describe('FlashcardSession reloads', () => {
  it('restarts at the first card, with fresh stats, when reloaded', async () => {
    const user = userEvent.setup();
    await startSession([card('c1', 'first'), card('c2', 'second')]);
    api.reviewFlashcard.mockResolvedValue({});

    // Grade both cards to reach the completion summary.
    for (const front of ['first', 'second']) {
      await screen.findByText(front);
      await user.click(screen.getByRole('button', { name: /Show Answer/i }));
      await user.click(screen.getByRole('button', { name: /Easy/ }));
    }
    await screen.findByText('Session Complete!');
    expect(screen.getByText(/2 cards/)).toBeInTheDocument();

    // Reloading returns a different, longer list. The walk must start over at
    // card 1 of 3 rather than resume at the old index (which was 2).
    api.getFlashcards.mockResolvedValue([
      card('c3', 'again-1'),
      card('c4', 'again-2'),
      card('c5', 'again-3'),
    ]);
    await user.click(screen.getByRole('button', { name: /Review Again/i }));

    expect(await screen.findByText('again-1')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });
});

describe('FlashcardSession deck filter', () => {
  it('passes a real deck id straight to the API', async () => {
    await startSession([card('c1', 'first')], { deckId: 'deck-7' });
    expect(api.getFlashcards).toHaveBeenCalledWith({
      due: true,
      intervals: true,
      deck_id: 'deck-7',
    });
  });

  it('passes the unassigned bucket through as a real filter value', async () => {
    await startSession([card('c1', 'first')], { deckId: UNASSIGNED_DECK });
    expect(api.getFlashcards).toHaveBeenCalledWith({
      due: true,
      intervals: true,
      deck_id: UNASSIGNED_DECK,
    });
  });

  it('asks for no deck filter when studying everything', async () => {
    await startSession([card('c1', 'first')], { deckId: null });
    expect(api.getFlashcards).toHaveBeenCalledWith({ due: true, intervals: true });
  });
});

describe('FlashcardSession study-ahead', () => {
  it('restarts the index when studying ahead after being caught up', async () => {
    const user = userEvent.setup();
    api.getFlashcards.mockResolvedValueOnce([]);
    render(<FlashcardSession deckId={null} onNavigate={vi.fn()} />);
    await screen.findByText(/all caught up/i);

    api.getFlashcards.mockResolvedValueOnce([card('c1', 'ahead-1'), card('c2', 'ahead-2')]);
    await user.click(screen.getByRole('button', { name: /Study Ahead Anyway/i }));

    expect(await screen.findByText('ahead-1')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });
});
