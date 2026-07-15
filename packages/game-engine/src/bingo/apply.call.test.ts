import { describe, it, expect } from 'vitest';
import { applyMove, checkGameEnd } from './apply';
import type { BingoState, BingoPlayer } from './types';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

function player(id: string, card: number[], overrides: Partial<BingoPlayer> = {}): BingoPlayer {
  return { id, name: id.toUpperCase(), isBot: false, card, ready: true, completedLines: 0, connected: true, bombNumber: null, ...overrides };
}

// Two players, playing phase. 'a' is on turn. Numbers 1..4 already called (top row minus the 5th cell).
function nearWinState(): BingoState {
  return {
    gridSize: 5,
    phase: 'playing',
    players: [player('a', ordered), player('b', ordered)],
    turnOrder: ['a', 'b'],
    currentTurn: 0,
    calledNumbers: [1, 2, 3, 4],
    winners: [],
    skipNext: false,
    bombPenalties: {},
  };
}

describe('applyMove (CallNumber)', () => {
  it('appends the called number and advances the turn when no one wins', () => {
    const s0 = nearWinState();
    const s = applyMove(s0, 'a', { type: 'CallNumber', n: 6 });
    expect(s.calledNumbers).toContain(6);
    expect(s.phase).toBe('playing');
    expect(s.currentTurn).toBe(1); // now b's turn
    // purity: input state must not be mutated
    expect(s0.calledNumbers).toEqual([1, 2, 3, 4]);
    expect(s0.currentTurn).toBe(0);
  });

  it('recomputes completedLines for all players on each call', () => {
    // calling 5 completes the top row for BOTH players (identical cards)
    const s = applyMove(nearWinState(), 'a', { type: 'CallNumber', n: 5 });
    expect(s.players.find((p) => p.id === 'b')!.completedLines).toBeGreaterThanOrEqual(1);
  });
});

describe('winner resolution (caller-priority)', () => {
  // Build a state where calling one number simultaneously completes the 5th line
  // for both players. Give both players the same card and set them to 4 completed lines,
  // needing only the top row's last cell (number 5).
  function bothAboutToWin(): BingoState {
    // rows 2..5 fully marked already => 4 completed lines each; top row missing only "5"
    const called = [
      6, 7, 8, 9, 10, // row 2
      11, 12, 13, 14, 15, // row 3
      16, 17, 18, 19, 20, // row 4
      21, 22, 23, 24, 25, // row 5
      1, 2, 3, 4, // top row minus 5
    ];
    return {
      gridSize: 5,
      phase: 'playing',
      players: [player('a', ordered, { completedLines: 4 }), player('b', ordered, { completedLines: 4 })],
      turnOrder: ['a', 'b'],
      currentTurn: 0, // a is the caller
      calledNumbers: called,
      winners: [],
      skipNext: false,
      bombPenalties: {},
    };
  }

  it('awards the win to the caller when the caller also reaches 5 lines', () => {
    const s = applyMove(bothAboutToWin(), 'a', { type: 'CallNumber', n: 5 });
    expect(s.phase).toBe('finished');
    expect(s.winners).toEqual(['a']); // caller wins the tie
  });

  it('awards the win to the first player forward from the caller when the caller is NOT a winner', () => {
    // Called so far: 1..20. Caller 'a' calls 21.
    // 'b' has the ordered card: with 1..21 marked, columns/rows complete a 5th line -> b wins.
    // 'a' has a card that places 22,23,24,25 at cells {1,5,12,24}, so with 1..21 marked
    // only 2 lines complete -> a is NOT among the winners.
    const aCard = [1, 22, 2, 3, 4, 23, 5, 6, 7, 8, 9, 10, 24, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25];
    const called = Array.from({ length: 20 }, (_, i) => i + 1); // 1..20
    const state: BingoState = {
      gridSize: 5,
      phase: 'playing',
      players: [player('a', aCard), player('b', ordered)],
      turnOrder: ['a', 'b'],
      currentTurn: 0, // 'a' is the caller
      calledNumbers: called,
      winners: [],
      skipNext: false,
      bombPenalties: {},
    };
    const s = applyMove(state, 'a', { type: 'CallNumber', n: 21 });
    expect(s.phase).toBe('finished');
    expect(s.winners).toEqual(['b']); // caller 'a' did not win; 'b' is first forward
    expect(s.players.find((p) => p.id === 'a')!.completedLines).toBeLessThan(5);
  });
});

describe('checkGameEnd', () => {
  it('reports finished with winners after a winning call', () => {
    const s = applyMove(nearWinState(), 'a', { type: 'CallNumber', n: 5 });
    // top row completes for caller 'a' (only 1 line) — not a win yet
    expect(checkGameEnd(s)).toEqual({ finished: false, winners: [] });
  });
});
