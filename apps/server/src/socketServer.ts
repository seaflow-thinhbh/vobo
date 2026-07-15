import type { Server, Socket } from 'socket.io';
import { bingoModule } from '@vobo/game-engine';
import type { RoomManager } from './roomManager';
import type { RoomStore } from './roomStore';
import type { RoomConfig } from './config';
import { ChatManager } from './chatManager';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Room,
  RoomSnapshot,
  RosterEntry,
  Ack,
  OkAck,
} from './types';

type Io = Server<ClientToServerEvents, ServerToClientEvents>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

export function attachSocketServer(io: Io, manager: RoomManager, store: RoomStore, cfg: RoomConfig, chat: ChatManager): void {
  const turnTimers = new Map<string, NodeJS.Timeout>();

  function clearTurnTimer(code: string): void {
    const t = turnTimers.get(code);
    if (t) {
      clearTimeout(t);
      turnTimers.delete(code);
    }
  }

  function snapshotFor(room: Room, playerId: string): RoomSnapshot {
    const source = room.state ? room.state.players : room.roster;
    const roster: RosterEntry[] = source.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      connected: p.isBot || room.seats.get(p.id)?.socketId != null,
      wins: room.wins[p.id] ?? 0,
    }));
    const view = room.state ? bingoModule.projectStateFor(room.state, playerId) : null;
    if (view) {
      for (const opp of view.opponents) {
        opp.connected = opp.isBot || room.seats.get(opp.id)?.socketId != null;
      }
    }
    return {
      code: room.code,
      status: room.state ? room.state.phase : 'lobby',
      hostId: room.hostId,
      youId: playerId,
      roster,
      view,
      turnStartedAt: room.state?.phase === 'playing' ? (room.turnStartedAt ?? null) : null,
      turnEndsAt: room.state?.phase === 'playing' ? (room.turnEndsAt ?? null) : null,
      turnMs: room.turnMs,
      rolling: room.state?.phase === 'playing' ? (room.rolling ?? false) : false,
      replayVotes: room.replayVotes ? [...room.replayVotes] : [],
      gridSize: room.gridSize,
      gameMode: room.gameMode,
    };
  }

  function broadcast(code: string): void {
    const room = store.get(code);
    if (!room) return;
    for (const [playerId, seat] of room.seats) {
      if (seat.socketId) io.to(seat.socketId).emit('room:state', snapshotFor(room, playerId));
    }
  }

  const LOBBY = '@lobby';
  function broadcastRooms(): void {
    io.to(LOBBY).emit('rooms:list', manager.listOpenRooms());
  }

  /** Drive automated turns (bot moves / turn timeouts) and end-of-game, then broadcast. */
  function orchestrate(code: string): void {
    clearTurnTimer(code);
    const room = store.get(code);
    if (!room || !room.state) { broadcast(code); return; }

    if (room.state.phase === 'finished') {
      room.lastWinnerId = room.state.winners[0];
      manager.recordWin(room);
      room.turnStartedAt = undefined;
      room.turnEndsAt = undefined;
      broadcast(code);
      io.to(code).emit('game:finished', { winnerId: room.state.winners[0]! });
      return;
    }
    if (room.state.phase !== 'playing') { broadcast(code); return; }

    // Fair dice reveal at the very start of a game: hold the turn timer for revealMs.
    const isGameStart = room.state.calledNumbers.length === 0 && room.state.currentTurn === 0;
    if (isGameStart && !room.revealDone) {
      room.rolling = true;
      room.revealDone = true;
      room.turnStartedAt = undefined;
      room.turnEndsAt = undefined;
      broadcast(code);
      turnTimers.set(
        code,
        setTimeout(() => {
          const r = store.get(code);
          if (r) r.rolling = false;
          orchestrate(code);
        }, cfg.revealMs),
      );
      return;
    }
    if (room.rolling) {
      // Re-entered mid-reveal (e.g. a leave): the shared timer was just cleared at
      // the top, so re-arm the reveal end or the room would stay stuck rolling.
      broadcast(code);
      turnTimers.set(
        code,
        setTimeout(() => {
          const r = store.get(code);
          if (r) r.rolling = false;
          orchestrate(code);
        }, cfg.revealMs),
      );
      return;
    }

    const cur = manager.currentPlayer(room);
    if (!cur) { broadcast(code); return; }
    // Record the deadline before broadcasting so the pushed snapshot reflects
    // the turn that clients are about to see, not the previous one.
    const now = Date.now();
    room.turnStartedAt = now;
    room.turnEndsAt = now + (cur.isBot ? cfg.botDelayMs : room.turnMs);
    broadcast(code);
    if (cur.isBot) {
      turnTimers.set(code, setTimeout(() => { manager.botCall(code); orchestrate(code); }, cfg.botDelayMs));
    } else {
      turnTimers.set(code, setTimeout(() => { manager.skipTurn(code); orchestrate(code); }, room.turnMs));
    }
  }

  io.on('connection', (socket: Sock) => {
    const conn: { code?: string; playerId?: string } = {};

    const requireConn = () =>
      conn.code && conn.playerId ? { code: conn.code, playerId: conn.playerId } : undefined;

    socket.on('room:create', ({ name, turnMs, gridSize, gameMode, bombsEnabled }, ack) => {
      const { code, playerId, token } = manager.createRoom(name, turnMs, gridSize as 5 | 6 | 7 | undefined, gameMode as 'fun' | 'casual' | undefined, bombsEnabled);
      conn.code = code;
      conn.playerId = playerId;
      manager.attachSocket(code, playerId, socket.id);
      void socket.join(code);
      ack({ ok: true, code, playerId, token });
      broadcast(code);
      broadcastRooms();
    });

    socket.on('room:join', ({ code, name }, ack) => {
      const r = manager.joinRoom(code, name);
      if (!r.ok) return ack(r);
      conn.code = code;
      conn.playerId = r.playerId;
      manager.attachSocket(code, r.playerId, socket.id);
      void socket.join(code);
      ack({ ok: true, playerId: r.playerId, token: r.token });
      broadcast(code);
      broadcastRooms();
    });

    socket.on('room:resume', ({ code, token }, ack) => {
      const r = manager.resume(code, token);
      if (!r.ok) return ack(r);
      conn.code = code;
      conn.playerId = r.playerId;
      manager.attachSocket(code, r.playerId, socket.id);
      manager.cancelDisconnectTimer(code, r.playerId);
      void socket.join(code);
      ack({ ok: true, playerId: r.playerId });
      broadcast(code);
    });

    socket.on('room:addBot', ({ difficulty }, ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const r = manager.addBot(c.code, c.playerId, difficulty);
      ack(r.ok ? { ok: true } : r);
      if (r.ok) broadcast(c.code);
    });

    socket.on('room:start', (ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const r = manager.startGame(c.code, c.playerId);
      ack(r.ok ? { ok: true } : r);
      if (r.ok) { orchestrate(c.code); broadcastRooms(); }
    });

    socket.on('player:fillCard', ({ card }, ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const r = manager.fillCard(c.code, c.playerId, card);
      ack(r.ok ? { ok: true } : r);
      if (r.ok) broadcast(c.code);
    });

    socket.on('player:placeBomb', ({ n }, ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const r = manager.placeBomb(c.code, c.playerId, n);
      ack(r.ok ? { ok: true } : r);
      if (r.ok) broadcast(c.code);
    });

    socket.on('player:ready', (ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const r = manager.setReady(c.code, c.playerId);
      ack(r.ok ? { ok: true } : r);
      if (r.ok) orchestrate(c.code); // readying the last player starts play
    });

    socket.on('game:call', ({ n }, ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      if (store.get(c.code)?.rolling) return ack({ ok: false, code: 'rolling', message: 'Đang chọn lượt đi đầu' });

      // Check bomb before applying
      const roomBefore = store.get(c.code);
      const bombHit = roomBefore?.state?.players.some(
        (p) => p.id !== c.playerId && p.bombNumber === n,
      );

      const r = manager.callNumber(c.code, c.playerId, n);
      ack(r.ok ? { ok: true } : r);
      if (r.ok) {
        if (bombHit) {
          const caller = roomBefore?.state?.players.find((p) => p.id === c.playerId);
          io.to(c.code).emit('bomb:triggered', {
            callerId: c.playerId,
            callerName: caller?.name ?? '?',
            number: n,
          });
          // Small delay for explosion animation before advancing
          setTimeout(() => orchestrate(c.code), 1500);
        } else {
          orchestrate(c.code);
        }
      }
    });

    socket.on('room:leave', (ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const r = manager.leave(c.code, c.playerId);
      ack(r.ok ? { ok: true } : r);
      if (r.ok && !r.roomDeleted) orchestrate(c.code);
      else if (r.ok && r.roomDeleted) clearTurnTimer(c.code);
      if (r.ok) broadcastRooms();
      void socket.leave(c.code);
      conn.code = undefined;
      conn.playerId = undefined;
    });

    socket.on('room:kick', ({ targetPlayerId }, ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const room = store.get(c.code);
      const targetSocketId = room?.seats.get(targetPlayerId)?.socketId;
      manager.cancelDisconnectTimer(c.code, targetPlayerId);
      const r = manager.kickPlayer(c.code, c.playerId, targetPlayerId);
      ack(r.ok ? { ok: true } : { ok: false, code: r.code, message: r.message } as Ack<OkAck>);
      if (r.ok) {
        if (targetSocketId) {
          io.to(targetSocketId).emit('kicked', { reason: 'Bạn đã bị đá khỏi phòng' });
        }
        broadcast(c.code);
        broadcastRooms();
      }
    });

    socket.on('room:newGame', (ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const r = manager.returnToLobby(c.code, c.playerId);
      ack(r.ok ? { ok: true } : r);
      if (r.ok) {
        orchestrate(c.code); // pushes the lobby snapshot to everyone
        broadcastRooms(); // the room is joinable again
      }
    });

    socket.on('room:readyToReplay', (ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const r = manager.voteReplay(c.code, c.playerId);
      ack(r.ok ? { ok: true } : { ok: false, code: r.code, message: r.message } as Ack<OkAck>);
      if (r.ok) {
        if (r.allReady) {
          orchestrate(c.code);
          broadcastRooms();
        } else {
          broadcast(c.code);
        }
      }
    });

    socket.on('chat:send', ({ text }, ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      if (!text || !text.trim()) {
        return ack({ ok: false, code: 'empty_text', message: 'Tin nhắn trống' });
      }
      const room = store.get(c.code);
      const player = room?.roster.find((p) => p.id === c.playerId)
        ?? room?.state?.players.find((p: { id: string }) => p.id === c.playerId);
      const name = player?.name ?? '?';
      const msg = chat.addMessage(c.code, c.playerId, name, text.trim());
      io.to(c.code).emit('chat:message', msg);
      ack({ ok: true });
    });

    socket.on('interaction:send', ({ targetPlayerId, type }, ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const room = store.get(c.code);
      if (!room) return ack({ ok: false, code: 'no_room', message: 'Không tìm thấy phòng' });
      if (!room.state || (room.state.phase !== 'playing' && room.state.phase !== 'setup')) {
        return ack({ ok: false, code: 'bad_phase', message: 'Chỉ tương tác khi đang chơi' });
      }
      const sender = room.state.players.find((p) => p.id === c.playerId);
      if (!sender) return ack({ ok: false, code: 'no_player', message: 'Không tìm thấy người chơi' });

      const targets = targetPlayerId === '*'
        ? room.state.players.filter((p) => p.id !== c.playerId).map((p) => p.id)
        : [targetPlayerId];

      for (const tid of targets) {
        if (!room.state.players.some((p) => p.id === tid)) continue;
        io.to(c.code).emit('interaction:receive', {
          fromId: c.playerId,
          fromName: sender.name,
          targetId: tid,
          type,
        });
      }
      ack({ ok: true });
    });

    socket.on('rooms:subscribe', (ack) => {
      void socket.join(LOBBY);
      ack(manager.listOpenRooms());
    });

    socket.on('rooms:unsubscribe', (ack) => {
      void socket.leave(LOBBY);
      ack({ ok: true });
    });

    socket.on('disconnect', () => {
      const c = requireConn();
      if (!c) return;
      manager.markDisconnected(c.code, c.playerId);
      broadcast(c.code);

      const room = store.get(c.code);
      if (!room) return;
      if (!room.disconnectTimers) room.disconnectTimers = new Map();
      const existing = room.disconnectTimers.get(c.playerId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        const currentRoom = store.get(c.code);
        if (!currentRoom) return;
        const seat = currentRoom.seats.get(c.playerId);
        if (seat && !seat.socketId) {
          const r = manager.leave(c.code, c.playerId);
          if (r.ok && !r.roomDeleted) orchestrate(c.code);
          else if (r.ok && r.roomDeleted) clearTurnTimer(c.code);
          if (r.ok) broadcastRooms();
        }
        currentRoom.disconnectTimers?.delete(c.playerId);
      }, cfg.disconnectGraceMs);
      room.disconnectTimers.set(c.playerId, timer);
    });
  });
}
