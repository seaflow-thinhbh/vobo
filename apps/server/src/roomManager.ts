import { bingoModule, createRng } from '@vobo/game-engine';
import type { Difficulty } from '@vobo/game-engine';
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

  addBot(code: string, hostId: string, difficulty: Difficulty): OpResult {
    const room = this.store.get(code);
    if (!room) return fail('no_room', 'Không tìm thấy phòng');
    if (room.hostId !== hostId) return fail('not_host', 'Chỉ chủ phòng mới thêm bot');
    if (room.state) return fail('already_started', 'Ván đã bắt đầu');
    if (room.roster.length >= this.cfg.maxPlayers) return fail('room_full', 'Phòng đã đầy');
    const botNumber = room.roster.filter((p) => p.isBot).length + 1;
    room.roster.push({
      id: 'bot_' + generatePlayerId().slice(2),
      name: `Bot ${botNumber}`,
      isBot: true,
      botDifficulty: difficulty,
    });
    return { ok: true };
  }

  startGame(code: string, hostId: string): OpResult {
    const room = this.store.get(code);
    if (!room) return fail('no_room', 'Không tìm thấy phòng');
    if (room.hostId !== hostId) return fail('not_host', 'Chỉ chủ phòng mới bắt đầu');
    if (room.state) return fail('already_started', 'Ván đã bắt đầu');
    if (room.roster.length < this.cfg.minPlayers) {
      return fail('not_enough_players', `Cần ít nhất ${this.cfg.minPlayers} người`);
    }
    room.state = bingoModule.createInitialState(room.roster, room.rng);
    return { ok: true };
  }

  fillCard(code: string, playerId: string, card: number[]): OpResult {
    return this.applyGameMove(code, playerId, { type: 'FillCard', card });
  }

  setReady(code: string, playerId: string): OpResult {
    return this.applyGameMove(code, playerId, { type: 'SetReady' });
  }

  callNumber(code: string, playerId: string, n: number): OpResult {
    return this.applyGameMove(code, playerId, { type: 'CallNumber', n });
  }

  private applyGameMove(
    code: string,
    playerId: string,
    move: import('@vobo/game-engine').BingoMove,
  ): OpResult {
    const room = this.store.get(code);
    if (!room || !room.state) return fail('no_game', 'Ván chưa bắt đầu');
    const check = bingoModule.validateMove(room.state, playerId, move);
    if (!check.ok) return fail(check.code, check.message);
    room.state = bingoModule.applyMove(room.state, playerId, move);
    return { ok: true };
  }
}
