import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import FlashcardDeckManager from './FlashcardDeckManager';
import * as api from '../api';

vi.mock('../api');

beforeEach(() => {
  vi.resetAllMocks();
});

describe('FlashcardDeckManager deck grid', () => {
  it('shows the counts the decks endpoint already computed', async () => {
    // Deliberately inconsistent with `cards` below: if the grid recomputed the
    // numbers client-side it would print 1/0 instead of the server's 12/5.
    api.getDecks.mockResolvedValue([
      { id: 'd1', name: 'Arrays', description: 'two pointers', color: '#3b82f6', cardCount: 12, dueCount: 5 },
    ]);
    api.getFlashcards.mockResolvedValue([
      { id: 'c1', deckId: 'd1', front: 'q', back: 'a', tag: 'dsa', due: false },
    ]);

    render(<FlashcardDeckManager onNavigate={vi.fn()} onStartStudy={vi.fn()} />);

    expect(await screen.findByText('Arrays')).toBeInTheDocument();
    expect(screen.getByText('12 cards')).toBeInTheDocument();
    expect(screen.getByText('5 due')).toBeInTheDocument();
  });

  it('reports a deck with nothing due as caught up', async () => {
    api.getDecks.mockResolvedValue([
      { id: 'd1', name: 'Graphs', cardCount: 4, dueCount: 0 },
    ]);
    api.getFlashcards.mockResolvedValue([]);

    render(<FlashcardDeckManager onNavigate={vi.fn()} onStartStudy={vi.fn()} />);

    expect(await screen.findByText('Graphs')).toBeInTheDocument();
    expect(screen.getByText('4 cards')).toBeInTheDocument();
    expect(screen.getByText('Caught up')).toBeInTheDocument();
  });
});
