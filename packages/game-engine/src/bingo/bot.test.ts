import { describe, it, expect } from 'vitest';
import { botMove } from './bot';
import { projectStateFor } from './project';
import type { BingoState } from './types';
import { createRng } from '../rng';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

function viewFor(called: number[], completedLines = 0) {
  const s: BingoState = {
    gridSize: 5,
    phase: 'playing',
    players: [
      { id: 'bot', name: 'Bot', isBot: true, card: ordered, ready: true, completedLines, connected: true, bombNumber: null },
      { id: 'x', name: 'X', isBot: false, card: ordered, ready: true, completedLines: 0, connected: true, bombNumber: null },
    ],
    turnOrder: ['bot', 'x'],
    currentTurn: 0,
    calledNumbers: called,
    winners: [],
    skipNext: false,
    bombPenalties: {},
  };
  return projectStateFor(s, 'bot');
}

describe('botMove', () => {
  it('easy: returns a valid, uncalled number', () => {
    const move = botMove(viewFor([1, 2, 3]), 'easy', createRng(5));
    expect(move.type).toBe('CallNumber');
    if (move.type === 'CallNumber') {
      expect(move.n).toBeGreaterThanOrEqual(1);
      expect(move.n).toBeLessThanOrEqual(25);
      expect([1, 2, 3]).not.toContain(move.n);
    }
  });

  it('medium: completes a line when one number away', () => {
    // top row 1..5: 1..4 already called; the winning move is to call 5
    const move = botMove(viewFor([1, 2, 3, 4]), 'medium', createRng(1));
    expect(move).toEqual({ type: 'CallNumber', n: 5 });
  });

  it('hard: also completes a line when one number away', () => {
    const move = botMove(viewFor([1, 2, 3, 4]), 'hard', createRng(1));
    expect(move).toEqual({ type: 'CallNumber', n: 5 });
  });

  it('is deterministic given the same view, difficulty, and seed', () => {
    const a = botMove(viewFor([2, 4, 6]), 'easy', createRng(99));
    const b = botMove(viewFor([2, 4, 6]), 'easy', createRng(99));
    expect(a).toEqual(b);
  });
});
