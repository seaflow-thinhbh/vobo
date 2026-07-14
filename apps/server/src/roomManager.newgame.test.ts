import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

// Build a room with host 'An' (human), one bot, and 'Bình' who leaves mid-game,
// then force the game to a finished state.
function finishedRoom() {
  const store = new InMemoryRoomStore();
  const m = new RoomManager(store, DEFAULT_CONFIG);
  const a = m.createRoom('An');
  const b = m.joinRoom(a.code, 'Bình') as { ok: true; playerId: string };
  m.addBot(a.code, a.playerId, 'medium');
  m.startGame(a.code, a.playerId);
  const room = store.get(a.code)!;
  // 'Bình' leaves mid-game: becomes a bot in state, seat removed.
  const bp = room.state!.players.find((p) => p.id === b.playerId)!;
  bp.isBot = true;
  room.seats.delete(b.playerId);
  // Force finished.
  room.state!.phase = 'finished';
  room.state!.winners = [a.playerId];
  return { store, m, code: a.code, host: a.playerId, left: b.playerId };
}

describe('RoomManager.returnToLobby', () => {
  it('host resets a finished game to lobby, keeping connected humans + bots, dropping leavers', () => {
    const { store, m, code, host, left } = finishedRoom();
    const r = m.returnToLobby(code, host);
    expect(r.ok).toBe(true);
    const room = store.get(code)!;
    expect(room.state).toBeUndefined(); // back to lobby
    const ids = room.roster.map((p) => p.id);
    expect(ids).toContain(host); // connected human kept
    expect(ids.some((id) => id.startsWith('bot_'))).toBe(true); // bot kept
    expect(ids).not.toContain(left); // player who left is dropped
    expect(room.turnStartedAt).toBeUndefined();
    expect(room.turnEndsAt).toBeUndefined();
  });

  it('lets a NON-host participant return a finished game to lobby', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, DEFAULT_CONFIG);
    const a = m.createRoom('An');
    const b = m.joinRoom(a.code, 'Bình') as { ok: true; playerId: string };
    m.startGame(a.code, a.playerId);
    const room = store.get(a.code)!;
    room.state!.phase = 'finished';
    room.state!.winners = [a.playerId];

    const r = m.returnToLobby(a.code, b.playerId); // Bình is not the host
    expect(r.ok).toBe(true);
    expect(store.get(a.code)!.state).toBeUndefined();
  });

  it('rejects a non-participant and a not-finished room', () => {
    const { m, code } = finishedRoom();
    expect(m.returnToLobby(code, 'ghost')).toMatchObject({ ok: false, code: 'not_player' });

    // a fresh lobby room (never started) -> not_finished
    const store2 = new InMemoryRoomStore();
    const m2 = new RoomManager(store2, DEFAULT_CONFIG);
    const a = m2.createRoom('An');
    expect(m2.returnToLobby(a.code, a.playerId)).toMatchObject({ ok: false, code: 'not_finished' });
  });
});
