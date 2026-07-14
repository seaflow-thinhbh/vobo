import type { Server, Socket } from 'socket.io';
import { bingoModule } from '@vobo/game-engine';
import type { RoomManager } from './roomManager';
import type { RoomStore } from './roomStore';
import type { RoomConfig } from './config';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  Room,
  RoomSnapshot,
  RosterEntry,
} from './types';

type Io = Server<ClientToServerEvents, ServerToClientEvents>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

export function attachSocketServer(io: Io, manager: RoomManager, store: RoomStore, cfg: RoomConfig): void {
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
    };
  }

  function broadcast(code: string): void {
    const room = store.get(code);
    if (!room) return;
    for (const [playerId, seat] of room.seats) {
      if (seat.socketId) io.to(seat.socketId).emit('room:state', snapshotFor(room, playerId));
    }
  }

  /** Drive automated turns (bot moves / turn timeouts) and end-of-game, then broadcast. */
  function orchestrate(code: string): void {
    clearTurnTimer(code);
    const room = store.get(code);
    if (!room || !room.state) { broadcast(code); return; }

    if (room.state.phase === 'finished') {
      room.turnStartedAt = undefined;
      room.turnEndsAt = undefined;
      broadcast(code);
      io.to(code).emit('game:finished', { winnerId: room.state.winners[0]! });
      return;
    }
    if (room.state.phase !== 'playing') { broadcast(code); return; }

    const cur = manager.currentPlayer(room);
    if (!cur) { broadcast(code); return; }
    // Record the deadline before broadcasting so the pushed snapshot reflects
    // the turn that clients are about to see, not the previous one.
    const now = Date.now();
    room.turnStartedAt = now;
    room.turnEndsAt = now + (cur.isBot ? cfg.botDelayMs : cfg.turnMs);
    broadcast(code);
    if (cur.isBot) {
      turnTimers.set(code, setTimeout(() => { manager.botCall(code); orchestrate(code); }, cfg.botDelayMs));
    } else {
      turnTimers.set(code, setTimeout(() => { manager.autoCall(code); orchestrate(code); }, cfg.turnMs));
    }
  }

  io.on('connection', (socket: Sock) => {
    const conn: { code?: string; playerId?: string } = {};

    const requireConn = () =>
      conn.code && conn.playerId ? { code: conn.code, playerId: conn.playerId } : undefined;

    socket.on('room:create', ({ name }, ack) => {
      const { code, playerId, token } = manager.createRoom(name);
      conn.code = code;
      conn.playerId = playerId;
      manager.attachSocket(code, playerId, socket.id);
      void socket.join(code);
      ack({ ok: true, code, playerId, token });
      broadcast(code);
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
    });

    socket.on('room:resume', ({ code, token }, ack) => {
      const r = manager.resume(code, token);
      if (!r.ok) return ack(r);
      conn.code = code;
      conn.playerId = r.playerId;
      manager.attachSocket(code, r.playerId, socket.id);
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
      if (r.ok) orchestrate(c.code);
    });

    socket.on('player:fillCard', ({ card }, ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const r = manager.fillCard(c.code, c.playerId, card);
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
      const r = manager.callNumber(c.code, c.playerId, n);
      ack(r.ok ? { ok: true } : r);
      if (r.ok) orchestrate(c.code);
    });

    socket.on('room:leave', (ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const r = manager.leave(c.code, c.playerId);
      ack(r.ok ? { ok: true } : r);
      if (r.ok && !r.roomDeleted) orchestrate(c.code);
      else if (r.ok && r.roomDeleted) clearTurnTimer(c.code);
      void socket.leave(c.code);
      conn.code = undefined;
      conn.playerId = undefined;
    });

    socket.on('disconnect', () => {
      const c = requireConn();
      if (!c) return;
      manager.markDisconnected(c.code, c.playerId);
      broadcast(c.code);
      // Turn timeouts continue to auto-call for a disconnected player's turns;
      // on resume they reclaim the seat. (No separate takeover timer — see plan.)
    });
  });
}
