import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

function makeManager() {
  return new RoomManager(new InMemoryRoomStore(), DEFAULT_CONFIG);
}

describe('RoomManager create/join', () => {
  it('createRoom returns code/playerId/token and seats the host', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, DEFAULT_CONFIG);
    const { code, playerId } = m.createRoom('An');
    const room = store.get(code)!;
    expect(room.hostId).toBe(playerId);
    expect(room.roster.map((p) => p.name)).toEqual(['An']);
    expect(room.seats.has(playerId)).toBe(true);
    expect(room.state).toBeUndefined(); // lobby
  });

  it('joinRoom adds a second player', () => {
    const m = makeManager();
    const { code } = m.createRoom('An');
    const r = m.joinRoom(code, 'Bình');
    expect(r.ok).toBe(true);
  });

  it('rejects joining a missing room', () => {
    const m = makeManager();
    const r = m.joinRoom('NOPE00', 'X');
    expect(r).toMatchObject({ ok: false, code: 'no_room' });
  });

  it('rejects joining a full room', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, { ...DEFAULT_CONFIG, maxPlayers: 2 });
    const { code } = m.createRoom('An');
    m.joinRoom(code, 'Bình');
    const r = m.joinRoom(code, 'Ba');
    expect(r).toMatchObject({ ok: false, code: 'room_full' });
  });
});
