import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

function finished2p() {
  const store = new InMemoryRoomStore();
  const m = new RoomManager(store, DEFAULT_CONFIG);
  const a = m.createRoom('An');
  const b = m.joinRoom(a.code, 'Bình') as { ok: true; playerId: string };
  m.startGame(a.code, a.playerId);
  const room = store.get(a.code)!;
  room.state!.phase = 'finished';
  room.state!.winners = [a.playerId];
  return { store, m, code: a.code, host: a.playerId, other: b.playerId, room };
}

describe('RoomManager win tally', () => {
  it('createRoom initializes an empty wins map', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, DEFAULT_CONFIG);
    const a = m.createRoom('An');
    expect(store.get(a.code)!.wins).toEqual({});
  });

  it('recordWin counts the winner once and is idempotent (no double-count)', () => {
    const { m, room, host } = finished2p();
    m.recordWin(room);
    m.recordWin(room); // a repeat orchestrate on a still-finished room
    expect(room.wins[host]).toBe(1);
  });

  it('does nothing when the game is not finished', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, DEFAULT_CONFIG);
    const a = m.createRoom('An');
    m.joinRoom(a.code, 'Bình');
    m.startGame(a.code, a.playerId); // phase is setup, not finished
    const room = store.get(a.code)!;
    m.recordWin(room);
    expect(room.wins).toEqual({});
  });

  it('keeps wins across returnToLobby and recounts after a new game', () => {
    const { m, room, host, code, store } = finished2p();
    m.recordWin(room);
    expect(room.wins[host]).toBe(1);

    m.returnToLobby(code, host);
    expect(store.get(code)!.wins[host]).toBe(1); // persists

    m.startGame(code, host); // resets the guard, keeps wins
    const r2 = store.get(code)!;
    r2.state!.phase = 'finished';
    r2.state!.winners = [host];
    m.recordWin(r2);
    expect(r2.wins[host]).toBe(2); // counted again after the guard reset
  });
});
