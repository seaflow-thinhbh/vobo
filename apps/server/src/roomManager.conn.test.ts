import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

function lobbyWithTwo() {
  const store = new InMemoryRoomStore();
  const m = new RoomManager(store, DEFAULT_CONFIG);
  const { code, playerId: a, token: ta } = m.createRoom('An');
  const j = m.joinRoom(code, 'Bình') as { ok: true; playerId: string; token: string };
  return { store, m, code, a, ta, b: j.playerId, tb: j.token };
}

describe('RoomManager leave/resume/connection', () => {
  it('leaving the lobby removes the player from the roster', () => {
    const { store, m, code, b } = lobbyWithTwo();
    const r = m.leave(code, b);
    expect(r).toMatchObject({ ok: true, roomDeleted: false });
    expect(store.get(code)!.roster.find((p) => p.id === b)).toBeUndefined();
  });

  it('host leaving transfers host to a remaining human', () => {
    const { store, m, code, a, b } = lobbyWithTwo();
    m.leave(code, a);
    expect(store.get(code)!.hostId).toBe(b);
  });

  it('deletes the room when the last human leaves', () => {
    const { store, m, code, a, b } = lobbyWithTwo();
    m.leave(code, a);
    const r = m.leave(code, b);
    expect(r).toMatchObject({ ok: true, roomDeleted: true });
    expect(store.get(code)).toBeUndefined();
  });

  it('resume matches a seat by token', () => {
    const { m, code, a, ta } = lobbyWithTwo();
    expect(m.resume(code, ta)).toMatchObject({ ok: true, playerId: a });
    expect(m.resume(code, 'wrong-token')).toMatchObject({ ok: false, code: 'bad_token' });
  });

  it('attachSocket / markDisconnected track the socket id', () => {
    const { store, m, code, a } = lobbyWithTwo();
    m.attachSocket(code, a, 'sock-1');
    expect(store.get(code)!.seats.get(a)!.socketId).toBe('sock-1');
    m.markDisconnected(code, a);
    expect(store.get(code)!.seats.get(a)!.socketId).toBeUndefined();
  });
});
