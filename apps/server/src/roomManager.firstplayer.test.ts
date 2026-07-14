import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

describe('RoomManager.startGame first player', () => {
  it('puts the recorded previous winner first', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, DEFAULT_CONFIG);
    const a = m.createRoom('An');
    const b = m.joinRoom(a.code, 'Bình') as { ok: true; playerId: string };
    store.get(a.code)!.lastWinnerId = b.playerId; // pretend Bình won last game
    m.startGame(a.code, a.playerId);
    expect(store.get(a.code)!.state!.turnOrder[0]).toBe(b.playerId);
  });

  it('resets the reveal flags on start', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, DEFAULT_CONFIG);
    const a = m.createRoom('An');
    m.joinRoom(a.code, 'Bình');
    const room = store.get(a.code)!;
    room.rolling = true;
    room.revealDone = true;
    m.startGame(a.code, a.playerId);
    expect(room.rolling).toBe(false);
    expect(room.revealDone).toBe(false);
  });
});
