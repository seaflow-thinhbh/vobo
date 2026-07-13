import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameBoard } from './GameBoard';
import type { BingoView } from '@/lib/types';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

function view(overrides: Partial<BingoView['you']> = {}): BingoView {
  const marked = ordered.map((n) => [1, 2, 3].includes(n)); // 1,2,3 marked
  return {
    phase: 'playing',
    you: { id: 'you', card: ordered, marked, completedLines: 2, ready: true, ...overrides },
    opponents: [],
    calledNumbers: [1, 2, 3],
    currentPlayerId: 'you',
    winners: [],
  };
}

describe('GameBoard', () => {
  it('renders all 25 numbers and marks called cells', () => {
    render(<GameBoard view={view()} />);
    const cellWith1 = screen.getByText('1').closest('td')!;
    const cellWith4 = screen.getByText('4').closest('td')!;
    expect(cellWith1.getAttribute('data-marked')).toBe('true');
    expect(cellWith4.getAttribute('data-marked')).toBe('false');
  });

  it('shows BINGO letter progress from completedLines', () => {
    render(<GameBoard view={view({ completedLines: 2 })} />);
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('O')).toBeInTheDocument();
  });
});
