import { describe, it, expect } from 'vitest';
import { validateMove } from './validate';
import type { BingoState } from './types';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

function setupState(): BingoState {
  return {
    gridSize: 5,
    phase: 'setup',
    players: [
      { id: 'a', name: 'A', isBot: false, card: [], ready: false, completedLines: 0, connected: true, bombNumber: null },
      { id: 'b', name: 'B', isBot: false, card: ordered, ready: true, completedLines: 0, connected: true, bombNumber: null },
    ],
    turnOrder: [],
    currentTurn: 0,
    calledNumbers: [],
    winners: [],
    skipNext: false,
  };
}

function playingState(): BingoState {
  return {
    gridSize: 5,
    phase: 'playing',
    players: [
      { id: 'a', name: 'A', isBot: false, card: ordered, ready: true, completedLines: 0, connected: true, bombNumber: null },
      { id: 'b', name: 'B', isBot: false, card: ordered, ready: true, completedLines: 0, connected: true, bombNumber: null },
    ],
    turnOrder: ['a', 'b'],
    currentTurn: 0,
    calledNumbers: [7],
    winners: [],
    skipNext: false,
  };
}

describe('validateMove', () => {
  it('rejects unknown player', () => {
    const r = validateMove(setupState(), 'ghost', { type: 'SetReady' });
    expect(r.ok).toBe(false);
  });

  it('accepts a valid FillCard in setup', () => {
    expect(validateMove(setupState(), 'a', { type: 'FillCard', card: ordered }).ok).toBe(true);
  });

  it('rejects an invalid FillCard', () => {
    expect(validateMove(setupState(), 'a', { type: 'FillCard', card: [1, 2] }).ok).toBe(false);
  });

  it('rejects SetReady before a valid card is filled', () => {
    expect(validateMove(setupState(), 'a', { type: 'SetReady' }).ok).toBe(false);
  });

  it('rejects CallNumber when it is not your turn', () => {
    expect(validateMove(playingState(), 'b', { type: 'CallNumber', n: 3 }).ok).toBe(false);
  });

  it('rejects calling an already-called number', () => {
    expect(validateMove(playingState(), 'a', { type: 'CallNumber', n: 7 }).ok).toBe(false);
  });

  it('accepts a valid CallNumber on your turn', () => {
    expect(validateMove(playingState(), 'a', { type: 'CallNumber', n: 3 }).ok).toBe(true);
  });
});
