import { describe, it, expect } from 'vitest';
import { projectStateFor } from './project';
import type { BingoState } from './types';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

function state(): BingoState {
  return {
    gridSize: 5,
    phase: 'playing',
    players: [
      { id: 'a', name: 'A', isBot: false, card: ordered, ready: true, completedLines: 1, connected: true, bombNumber: null },
      { id: 'b', name: 'B', isBot: true, botDifficulty: 'hard', card: ordered, ready: true, completedLines: 2, connected: true, bombNumber: null },
    ],
    turnOrder: ['a', 'b'],
    currentTurn: 0,
    calledNumbers: [1, 2, 3],
    winners: [],
    skipNext: false,
    bombPenalties: {},
  };
}

describe('projectStateFor', () => {
  it('exposes your own full card with a marked mask', () => {
    const v = projectStateFor(state(), 'a');
    expect(v.you.card).toEqual(ordered);
    expect(v.you.marked[0]).toBe(true); // holds 1, called
    expect(v.you.marked[3]).toBe(false); // holds 4, not called
    expect(v.you.completedLines).toBe(1);
  });

  it('HIDES opponents cards, exposing only name and progress', () => {
    const v = projectStateFor(state(), 'a');
    expect(v.opponents).toHaveLength(1);
    const opp = v.opponents[0]!;
    expect(opp.id).toBe('b');
    expect(opp.completedLines).toBe(2);
    // The opponent projection must not carry a card field at all.
    expect((opp as Record<string, unknown>).card).toBeUndefined();
  });

  it('reports whose turn it is during play', () => {
    expect(projectStateFor(state(), 'a').currentPlayerId).toBe('a');
  });
});
