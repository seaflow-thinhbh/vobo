import { describe, it, expect } from 'vitest';
import { createInitialState } from './state';
import { isValidCard } from './setup';
import { createRng } from '../rng';
import type { PlayerSeat } from '../types';

const seats: PlayerSeat[] = [
  { id: 'h1', name: 'An', isBot: false },
  { id: 'b1', name: 'Bot K', isBot: true, botDifficulty: 'medium' },
];

describe('createInitialState', () => {
  it('starts in setup phase with a turn order that is a permutation of the players', () => {
    const s = createInitialState(seats, createRng(1));
    expect(s.phase).toBe('setup');
    expect(s.calledNumbers).toEqual([]);
    expect([...s.turnOrder].sort()).toEqual(['b1', 'h1']);
    expect(s.currentTurn).toBe(0);
    expect(s.winners).toEqual([]);
  });

  it('is deterministic for a given seed', () => {
    expect(createInitialState(seats, createRng(7)).turnOrder).toEqual(
      createInitialState(seats, createRng(7)).turnOrder,
    );
  });

  it('puts firstPlayerId at the front when it is present', () => {
    const three: PlayerSeat[] = [
      { id: 'a', name: 'A', isBot: false },
      { id: 'b', name: 'B', isBot: false },
      { id: 'c', name: 'C', isBot: false },
    ];
    const s = createInitialState(three, createRng(3), { firstPlayerId: 'c' });
    expect(s.turnOrder[0]).toBe('c');
    expect([...s.turnOrder].sort()).toEqual(['a', 'b', 'c']);
  });

  it('ignores an unknown firstPlayerId (still a valid order)', () => {
    const s = createInitialState(seats, createRng(3), { firstPlayerId: 'ghost' });
    expect([...s.turnOrder].sort()).toEqual(['b1', 'h1']);
  });

  it('gives bots a valid card and marks them ready; humans start empty and not ready', () => {
    const s = createInitialState(seats, createRng(1));
    const human = s.players.find((p) => p.id === 'h1')!;
    const bot = s.players.find((p) => p.id === 'b1')!;
    expect(human.card).toEqual([]);
    expect(human.ready).toBe(false);
    expect(isValidCard(bot.card)).toBe(true);
    expect(bot.ready).toBe(true);
  });

  it('marks all players connected with 0 completed lines', () => {
    const s = createInitialState(seats, createRng(1));
    for (const p of s.players) {
      expect(p.connected).toBe(true);
      expect(p.completedLines).toBe(0);
    }
  });
});
