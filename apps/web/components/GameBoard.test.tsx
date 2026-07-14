import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameBoard } from './GameBoard';
import type { BingoView } from '@/lib/types';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

function view(): BingoView {
  const marked = ordered.map((n) => [1, 2, 3].includes(n)); // 1,2,3 marked
  return {
    phase: 'playing',
    you: { id: 'you', card: ordered, marked, completedLines: 2, ready: true },
    opponents: [],
    calledNumbers: [1, 2, 3],
    currentPlayerId: 'you',
    winners: [],
  };
}

describe('GameBoard', () => {
  it('renders 25 number buttons and marks called cells', () => {
    render(<GameBoard view={view()} />);
    expect(screen.getByRole('button', { name: '1' }).getAttribute('data-marked')).toBe('true');
    expect(screen.getByRole('button', { name: '4' }).getAttribute('data-marked')).toBe('false');
  });

  it('on your turn, clicking an unmarked cell calls onCall with that number', async () => {
    const onCall = vi.fn();
    const user = userEvent.setup();
    render(<GameBoard view={view()} isYourTurn onCall={onCall} />);
    await user.click(screen.getByRole('button', { name: '4' }));
    expect(onCall).toHaveBeenCalledWith(4);
  });

  it('marked cells are disabled, and off your turn nothing is clickable', () => {
    const onCall = vi.fn();
    const { rerender } = render(<GameBoard view={view()} isYourTurn onCall={onCall} />);
    expect(screen.getByRole('button', { name: '1' })).toBeDisabled(); // marked
    rerender(<GameBoard view={view()} isYourTurn={false} onCall={onCall} />);
    expect(screen.getByRole('button', { name: '4' })).toBeDisabled(); // off turn
  });

  it('updates data-marked when a new number is marked across rerenders', () => {
    const base = view();
    const { rerender } = render(<GameBoard view={base} />);
    expect(screen.getByRole('button', { name: '4' }).getAttribute('data-marked')).toBe('false');

    const next: BingoView = {
      ...base,
      you: { ...base.you, marked: base.you.marked.map((m, i) => m || i === 3) },
      calledNumbers: [1, 2, 3, 4],
    };
    rerender(<GameBoard view={next} />);
    expect(screen.getByRole('button', { name: '4' }).getAttribute('data-marked')).toBe('true');
    expect(screen.getByRole('button', { name: '4' }).getAttribute('data-idx')).toBe('3');
  });
});
