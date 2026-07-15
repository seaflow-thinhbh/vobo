import { describe, it, expect } from 'vitest';
import { applyMove } from './apply';
import type { BingoState } from './types';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

function twoHumanSetup(): BingoState {
  return {
    gridSize: 5,
    phase: 'setup',
    players: [
      { id: 'a', name: 'A', isBot: false, card: [], ready: false, completedLines: 0, connected: true, bombNumber: null },
      { id: 'b', name: 'B', isBot: false, card: [], ready: false, completedLines: 0, connected: true, bombNumber: null },
    ],
    turnOrder: [],
    currentTurn: 0,
    calledNumbers: [],
    winners: [],
    skipNext: false,
    bombPenalties: {},
  };
}

describe('applyMove (setup)', () => {
  it('FillCard sets the player card without mutating the input state', () => {
    const s0 = twoHumanSetup();
    const s1 = applyMove(s0, 'a', { type: 'FillCard', card: ordered });
    expect(s1.players.find((p) => p.id === 'a')!.card).toEqual(ordered);
    expect(s0.players.find((p) => p.id === 'a')!.card).toEqual([]); // immutable
  });

  it('SetReady flips ready but stays in setup until everyone is ready', () => {
    let s = twoHumanSetup();
    s = applyMove(s, 'a', { type: 'FillCard', card: ordered });
    s = applyMove(s, 'a', { type: 'SetReady' });
    expect(s.phase).toBe('setup');
    expect(s.players.find((p) => p.id === 'a')!.ready).toBe(true);
  });

  it('transitions to playing when the last player readies (turnOrder is set by createInitialState, not here)', () => {
    let s = twoHumanSetup();
    s = applyMove(s, 'a', { type: 'FillCard', card: ordered });
    s = applyMove(s, 'a', { type: 'SetReady' });
    s = applyMove(s, 'b', { type: 'FillCard', card: ordered });
    s = applyMove(s, 'b', { type: 'SetReady' });
    expect(s.phase).toBe('playing');
    expect(s.currentTurn).toBe(0);
    expect(s.turnOrder).toEqual([]); // fixture never set it; setReady no longer seeds it
  });
});
