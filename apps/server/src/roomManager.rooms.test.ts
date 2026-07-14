import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

describe('RoomManager.listOpenRooms', () => {
  it('lists lobby rooms that are not full, with host name and player count', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, DEFAULT_CONFIG);

    const a = m.createRoom('An'); // lobby, 1 player -> open
    const b = m.createRoom('Bình');
    m.joinRoom(b.code, 'Ba');
    m.startGame(b.code, b.playerId); // b needs 2 players; now playing -> NOT open

    const open = m.listOpenRooms();
    expect(open.map((r) => r.code)).toEqual([a.code]);
    expect(open[0]).toMatchObject({ code: a.code, hostName: 'An', playerCount: 1, maxPlayers: 6 });
  });

  it('excludes full rooms', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, { ...DEFAULT_CONFIG, maxPlayers: 2 });
    const a = m.createRoom('An');
    m.joinRoom(a.code, 'Bình'); // now 2/2 -> full -> not open
    expect(m.listOpenRooms()).toEqual([]);
  });
});
