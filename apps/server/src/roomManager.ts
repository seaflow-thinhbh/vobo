import { bingoModule, createRng } from '@vobo/game-engine';
import type { Difficulty, BingoPlayer } from '@vobo/game-engine';
import type { RoomConfig } from './config';
import { TURN_PRESETS_MS } from './config';
import type { OpResult, OpenRoom, Room } from './types';
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

  createRoom(name: string, turnMs?: number): { code: string; playerId: string; token: string } {
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
      turnMs: turnMs !== undefined && TURN_PRESETS_MS.includes(turnMs) ? turnMs : this.cfg.turnMs,
      wins: {},
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

  kickPlayer(code: string, hostId: string, targetPlayerId: string): OpResult {
    const room = this.store.get(code);
    if (!room) return fail('no_room', 'Không tìm thấy phòng');
    if (room.hostId !== hostId) return fail('not_host', 'Chỉ chủ phòng mới có quyền đá');
    if (room.state) return fail('already_started', 'Không thể đá khi ván đã bắt đầu');
    if (hostId === targetPlayerId) return fail('cannot_kick_self', 'Không thể tự đá chính mình');
    const target = room.roster.find((p) => p.id === targetPlayerId);
    if (!target) return fail('no_player', 'Người chơi không tồn tại');
    if (target.isBot) return fail('no_player', 'Không thể đá bot');
    room.roster = room.roster.filter((p) => p.id !== targetPlayerId);
    room.seats.delete(targetPlayerId);
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
    room.rolling = false;
    room.revealDone = false;
    room.winRecorded = false;
    room.state = bingoModule.createInitialState(room.roster, room.rng, {
      firstPlayerId: room.lastWinnerId,
    });
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

  /** The player whose turn it is, or undefined outside the playing phase. */
  currentPlayer(room: Room): BingoPlayer | undefined {
    const state = room.state;
    if (!state || state.phase !== 'playing') return undefined;
    const id = state.turnOrder[state.currentTurn];
    return state.players.find((p) => p.id === id);
  }

  /** Apply the current bot's chosen move (no-op guard if not a bot's turn). */
  botCall(code: string): OpResult {
    const room = this.store.get(code);
    if (!room || !room.state) return fail('no_game', 'Ván chưa bắt đầu');
    const cur = this.currentPlayer(room);
    if (!cur) return fail('not_playing', 'Không ở lượt chơi');
    const view = bingoModule.projectStateFor(room.state, cur.id);
    const move = bingoModule.botMove(view, cur.botDifficulty ?? 'medium', room.botRng);
    room.state = bingoModule.applyMove(room.state, cur.id, move);
    return { ok: true };
  }

  /** Call a random legal number for the current player (turn-timeout / disconnected). */
  autoCall(code: string): OpResult {
    const room = this.store.get(code);
    if (!room || !room.state) return fail('no_game', 'Ván chưa bắt đầu');
    const cur = this.currentPlayer(room);
    if (!cur) return fail('not_playing', 'Không ở lượt chơi');
    const uncalled = uncalledNumbers(room.state.calledNumbers);
    if (uncalled.length === 0) return fail('no_numbers', 'Hết số để hô');
    const n = uncalled[room.botRng.int(uncalled.length)]!;
    room.state = bingoModule.applyMove(room.state, cur.id, { type: 'CallNumber', n });
    return { ok: true };
  }

  attachSocket(code: string, playerId: string, socketId: string): void {
    const seat = this.store.get(code)?.seats.get(playerId);
    if (seat) seat.socketId = socketId;
  }

  cancelDisconnectTimer(code: string, playerId: string): void {
    const room = this.store.get(code);
    if (!room?.disconnectTimers) return;
    const t = room.disconnectTimers.get(playerId);
    if (t) { clearTimeout(t); room.disconnectTimers.delete(playerId); }
  }

  markDisconnected(code: string, playerId: string): void {
    const seat = this.store.get(code)?.seats.get(playerId);
    if (seat) seat.socketId = undefined;
  }

  resume(code: string, token: string): OpResult<{ playerId: string }> {
    const room = this.store.get(code);
    if (!room) return fail('no_room', 'Không tìm thấy phòng');
    for (const [playerId, seat] of room.seats) {
      if (seat.token === token) {
        this.cancelDisconnectTimer(code, playerId);
        return { ok: true, playerId };
      }
    }
    return fail('bad_token', 'Phiên không hợp lệ');
  }

  leave(code: string, playerId: string): OpResult<{ roomDeleted: boolean }> {
    const room = this.store.get(code);
    if (!room) return fail('no_room', 'Không tìm thấy phòng');

    if (!room.state) {
      // lobby: drop from the roster
      room.roster = room.roster.filter((p) => p.id !== playerId);
    } else {
      // in-game: convert the seat to a bot so the game keeps going.
      // Safe in-place mutation: bingoModule.applyMove always rebuilds player
      // objects via spread, so this current-state object isn't shared with any
      // prior/emitted snapshot.
      const p = room.state.players.find((x) => x.id === playerId);
      if (p) p.isBot = true;
    }
    room.seats.delete(playerId);

    // transfer host if needed
    if (room.hostId === playerId) {
      const nextHuman = [...room.seats.keys()][0];
      if (nextHuman) room.hostId = nextHuman;
    }

    // delete the room when no human seats remain
    if (room.seats.size === 0) {
      this.store.delete(code);
      return { ok: true, roomDeleted: true };
    }
    return { ok: true, roomDeleted: false };
  }

  /** Joinable rooms for the landing-page list: in lobby (not started) and not full. */
  listOpenRooms(): OpenRoom[] {
    const out: OpenRoom[] = [];
    for (const room of this.store.values()) {
      if (room.state) continue; // started
      if (room.roster.length >= this.cfg.maxPlayers) continue; // full
      const host = room.roster.find((p) => p.id === room.hostId);
      out.push({
        code: room.code,
        hostName: host?.name ?? '?',
        playerCount: room.roster.length,
        maxPlayers: this.cfg.maxPlayers,
      });
    }
    return out;
  }

  /** Count the winner of a just-finished game, exactly once. Safe to call repeatedly. */
  recordWin(room: Room): void {
    if (!room.state || room.state.phase !== 'finished' || room.winRecorded) return;
    const winnerId = room.state.winners[0];
    if (winnerId) room.wins[winnerId] = (room.wins[winnerId] ?? 0) + 1;
    room.winRecorded = true;
  }

  /** Any participant resets a finished game back to the room lobby, ready for another game. */
  returnToLobby(code: string, playerId: string): OpResult {
    const room = this.store.get(code);
    if (!room) return fail('no_room', 'Không tìm thấy phòng');
    if (!room.state || room.state.phase !== 'finished') {
      return fail('not_finished', 'Ván chưa kết thúc');
    }
    if (!room.state.players.some((p) => p.id === playerId)) {
      return fail('not_player', 'Bạn không ở trong ván này');
    }
    // Keep still-present players: connected humans (have a seat) + real bots (id 'bot_').
    room.roster = room.state.players
      .filter((p) => room.seats.has(p.id) || p.id.startsWith('bot_'))
      .map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, botDifficulty: p.botDifficulty }));
    room.state = undefined;
    room.replayVotes = undefined;
    room.turnStartedAt = undefined;
    room.turnEndsAt = undefined;
    return { ok: true };
  }

  voteReplay(code: string, playerId: string): OpResult<{ allReady: boolean }> {
    const room = this.store.get(code);
    if (!room) return fail('no_room', 'Không tìm thấy phòng');
    if (!room.state || room.state.phase !== 'finished') {
      return fail('not_finished', 'Ván chưa kết thúc');
    }
    if (!room.seats.has(playerId)) return fail('not_player', 'Bạn không ở trong phòng');
    if (!room.replayVotes) room.replayVotes = new Set();
    if (room.replayVotes.has(playerId)) return { ok: true, allReady: false };
    room.replayVotes.add(playerId);
    const allReady = room.replayVotes.size >= room.seats.size;
    if (allReady) {
      room.replayVotes = undefined;
      this.returnToLobby(code, playerId);
    }
    return { ok: true, allReady };
  }
}

function uncalledNumbers(called: number[]): number[] {
  const set = new Set(called);
  const out: number[] = [];
  for (let n = 1; n <= 25; n++) if (!set.has(n)) out.push(n);
  return out;
}
