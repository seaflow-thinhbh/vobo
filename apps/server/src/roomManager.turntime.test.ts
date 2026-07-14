import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

describe('RoomManager.createRoom turn time', () => {
  it('uses a valid preset when given one', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, DEFAULT_CONFIG);
    const { code } = m.createRoom('An', 45_000);
    expect(store.get(code)!.turnMs).toBe(45_000);
  });

  it('falls back to the default for a missing or invalid value', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, DEFAULT_CONFIG);
    expect(store.get(m.createRoom('A').code)!.turnMs).toBe(20_000);
    expect(store.get(m.createRoom('B', 999).code)!.turnMs).toBe(20_000);
  });
});
