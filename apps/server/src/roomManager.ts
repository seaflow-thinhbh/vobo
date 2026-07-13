import { createRng } from '@vobo/game-engine';
import type { RoomConfig } from './config';
import type { OpResult, Room } from './types';
import type { RoomStore } from './roomStore';
import { generateRoomCode } from './roomCode';
import { generatePlayerId, generateToken } from './ids';

function fail(code: string, message: string): { ok: false; code: string; message: string } {
  return { ok: false, code, message };
}

export class RoomManager {
  constructor(
    private store: RoomStore,
    private cfg: RoomConfig,
    private rand: () => number = Math.random,
  ) {}

  createRoom(name: string): { code: string; playerId: string; token: string } {
    const code = generateRoomCode(this.rand, (c) => this.store.has(c));
    const playerId = generatePlayerId();
    const token = generateToken();
    const seed = Math.floor(this.rand() * 0x7fffffff);
    const room: Room = {
      code,
      hostId: playerId,
      gameId: 'bingo',
      roster: [{ id: playerId, name, isBot: false }],
      seats: new Map([[playerId, { token }]]),
      rng: createRng(seed),
      botRng: createRng(seed ^ 0x9e3779b9),
    };
    this.store.create(room);
    return { code, playerId, token };
  }

  joinRoom(code: string, name: string): OpResult<{ playerId: string; token: string }> {
    const room = this.store.get(code);
    if (!room) return fail('no_room', 'Không tìm thấy phòng');
    if (room.state) return fail('already_started', 'Ván đã bắt đầu');
    if (room.roster.length >= this.cfg.maxPlayers) return fail('room_full', 'Phòng đã đầy');
    const playerId = generatePlayerId();
    const token = generateToken();
    room.roster.push({ id: playerId, name, isBot: false });
    room.seats.set(playerId, { token });
    return { ok: true, playerId, token };
  }
}
