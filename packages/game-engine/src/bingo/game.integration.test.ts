import { describe, it, expect } from 'vitest';
import { bingoModule } from './index';
import { createRng } from '../rng';
import type { PlayerSeat } from '../types';
import type { BingoState, BingoMove } from './types';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

const seats: PlayerSeat[] = [
  { id: 'a', name: 'An', isBot: false },
  { id: 'b', name: 'Bình', isBot: false },
];

// Helper: validate then apply, asserting the move was legal.
function play(state: BingoState, playerId: string, move: BingoMove): BingoState {
  const check = bingoModule.validateMove(state, playerId, move);
  expect(check.ok).toBe(true);
  return bingoModule.applyMove(state, playerId, move);
}

describe('bingoModule (full game)', () => {
  it('plays setup -> playing -> a winner is decided', () => {
    let s = bingoModule.createInitialState(seats, createRng(1));

    // both fill identical ordered cards and ready up
    s = play(s, 'a', { type: 'FillCard', card: ordered });
    s = play(s, 'a', { type: 'SetReady' });
    s = play(s, 'b', { type: 'FillCard', card: ordered });
    s = play(s, 'b', { type: 'SetReady' });
    expect(s.phase).toBe('playing');

    // Drive calls until the game finishes. Each player calls the lowest legal number.
    let guard = 0;
    while (bingoModule.checkGameEnd(s).finished === false) {
      const current = s.turnOrder[s.currentTurn]!;
      const next = [...Array(25)].map((_, i) => i + 1).find((n) => !s.calledNumbers.includes(n))!;
      s = play(s, current, { type: 'CallNumber', n: next });
      if (++guard > 25) throw new Error('game did not terminate');
    }

    const end = bingoModule.checkGameEnd(s);
    expect(end.finished).toBe(true);
    expect(end.winners).toHaveLength(1);
    expect(['a', 'b']).toContain(end.winners[0]);
  });

  it('projects a hidden-opponent view for the winner', () => {
    let s = bingoModule.createInitialState(seats, createRng(2));
    s = play(s, 'a', { type: 'FillCard', card: ordered });
    s = play(s, 'a', { type: 'SetReady' });
    s = play(s, 'b', { type: 'FillCard', card: ordered });
    s = play(s, 'b', { type: 'SetReady' });
    const view = bingoModule.projectStateFor(s, 'a');
    expect(view.opponents[0]!.id).toBe('b');
    expect((view.opponents[0] as Record<string, unknown>).card).toBeUndefined();
  });
});
