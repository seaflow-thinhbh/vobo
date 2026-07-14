import { describe, it, expect } from 'vitest';
import { InMemoryRoomStore } from './roomStore';
import type { Room } from './types';
import { createRng } from '@vobo/game-engine';

function makeRoom(code: string): Room {
  return {
    code,
    hostId: 'p1',
    gameId: 'bingo',
    roster: [],
    seats: new Map(),
    rng: createRng(1),
    botRng: createRng(2),
  };
}

describe('InMemoryRoomStore', () => {
  it('creates, gets, and reports existence', () => {
    const store = new InMemoryRoomStore();
    expect(store.has('ABC')).toBe(false);
    store.create(makeRoom('ABC'));
    expect(store.has('ABC')).toBe(true);
    expect(store.get('ABC')?.code).toBe('ABC');
  });

  it('deletes rooms', () => {
    const store = new InMemoryRoomStore();
    store.create(makeRoom('XYZ'));
    store.delete('XYZ');
    expect(store.get('XYZ')).toBeUndefined();
  });

  it('values() lists all rooms', () => {
    const store = new InMemoryRoomStore();
    store.create(makeRoom('AAA'));
    store.create(makeRoom('BBB'));
    expect(store.values().map((r) => r.code).sort()).toEqual(['AAA', 'BBB']);
  });
});
