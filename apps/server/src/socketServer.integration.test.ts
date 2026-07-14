import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { InMemoryRoomStore } from './roomStore';
import { RoomManager } from './roomManager';
import { attachSocketServer } from './socketServer';
import type { RoomSnapshot } from './types';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

let http: HttpServer;
let io: Server;
let port: number;
const clients: ClientSocket[] = [];

beforeEach(async () => {
  http = createServer();
  io = new Server(http);
  const store = new InMemoryRoomStore();
  // turnMs high so timeouts don't interfere with manual play; botDelay small for the bot game
  const manager = new RoomManager(store, { maxPlayers: 6, minPlayers: 2, turnMs: 60_000, botDelayMs: 5, revealMs: 20 });
  attachSocketServer(io, manager, store, { maxPlayers: 6, minPlayers: 2, turnMs: 60_000, botDelayMs: 5, revealMs: 20 });
  await new Promise<void>((resolve) => http.listen(0, resolve));
  port = (http.address() as { port: number }).port;
});

afterEach(async () => {
  for (const c of clients) c.close();
  clients.length = 0;
  io.close();
  await new Promise<void>((resolve) => http.close(() => resolve()));
});

function connect(): ClientSocket {
  const c = ioClient(`http://localhost:${port}`);
  clients.push(c);
  return c;
}

async function startTestServer(cfg: { maxPlayers: number; minPlayers: number; turnMs: number; botDelayMs: number; revealMs: number }) {
  const httpS = createServer();
  const ioS = new Server(httpS);
  const store = new InMemoryRoomStore();
  const manager = new RoomManager(store, cfg);
  attachSocketServer(ioS, manager, store, cfg);
  await new Promise<void>((resolve) => httpS.listen(0, resolve));
  const p = (httpS.address() as { port: number }).port;
  return {
    port: p,
    close: async () => {
      ioS.close();
      await new Promise<void>((resolve) => httpS.close(() => resolve()));
    },
  };
}

function emit<T>(c: ClientSocket, event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve) => {
    if (payload === undefined) c.emit(event, resolve);
    else c.emit(event, payload, resolve);
  });
}

describe('socket server (end-to-end)', () => {
  it('two humans play a full game to a finish over the wire', async () => {
    const a = connect();
    const b = connect();

    const created = await emit<{ ok: true; code: string; playerId: string }>(a, 'room:create', { name: 'An' });
    expect(created.ok).toBe(true);
    const code = created.code;

    const joined = await emit<{ ok: true; playerId: string }>(b, 'room:join', { code, name: 'Bình' });
    expect(joined.ok).toBe(true);

    await emit(a, 'room:start');
    await emit(a, 'player:fillCard', { card: ordered });
    await emit(a, 'player:ready');
    await emit(b, 'player:fillCard', { card: ordered });
    await emit(b, 'player:ready');

    // Listen for the finish.
    const finished = new Promise<{ winnerId: string }>((resolve) => {
      a.on('game:finished', resolve);
      b.on('game:finished', resolve);
    });

    // Drive calls: whoever's turn it is calls the lowest uncalled number.
    // Track the current snapshot for each client.
    let snap: RoomSnapshot | undefined;
    a.on('room:state', (s: RoomSnapshot) => { snap = s; });
    b.on('room:state', (s: RoomSnapshot) => { snap = s; });

    // Poll-drive up to 30 calls.
    for (let i = 0; i < 30; i++) {
      const s = snap;
      if (!s || s.status !== 'playing' || !s.view) { await delay(10); continue; }
      const current = s.view.currentPlayerId;
      if (!current) { await delay(10); continue; }
      const caller = current === created.playerId ? a : b;
      const next = ordered.find((n) => !s.view!.calledNumbers.includes(n))!;
      await emit(caller, 'game:call', { n: next });
      await delay(10);
    }

    const result = await Promise.race([finished, delay(2000).then(() => null)]);
    expect(result).not.toBeNull();
    expect(typeof result!.winnerId).toBe('string');
  });

  it('a human vs a bot finishes automatically (bot auto-plays its turns)', async () => {
    const a = connect();
    const created = await emit<{ ok: true; code: string; playerId: string }>(a, 'room:create', { name: 'An' });
    const code = created.code;
    await emit(a, 'room:addBot', { difficulty: 'easy' });
    await emit(a, 'room:start');
    await emit(a, 'player:fillCard', { card: ordered });

    const finished = new Promise<{ winnerId: string }>((resolve) => a.on('game:finished', resolve));

    let snap: RoomSnapshot | undefined;
    a.on('room:state', (s: RoomSnapshot) => { snap = s; });

    await emit(a, 'player:ready'); // starts play; bot will auto-take its turns

    // 'a' calls on its turns; the bot auto-plays on its turns via botDelay.
    for (let i = 0; i < 40; i++) {
      const s = snap;
      if (s?.status === 'finished') break;
      if (s?.status === 'playing' && s.view?.currentPlayerId === created.playerId) {
        const next = ordered.find((n) => !s.view!.calledNumbers.includes(n));
        if (next) await emit(a, 'game:call', { n: next });
      }
      await delay(15);
    }

    const result = await Promise.race([finished, delay(2000).then(() => null)]);
    expect(result).not.toBeNull();
  });

  it('opponent cards are hidden in the pushed snapshot', async () => {
    const a = connect();
    const b = connect();
    const created = await emit<{ ok: true; code: string }>(a, 'room:create', { name: 'An' });
    await emit(b, 'room:join', { code: created.code, name: 'Bình' });
    await emit(a, 'room:start');
    await emit(a, 'player:fillCard', { card: ordered });

    const snapA = await new Promise<RoomSnapshot>((resolve) => {
      a.on('room:state', (s: RoomSnapshot) => { if (s.view && s.view.you.card.length === 25) resolve(s); });
      void emit(a, 'player:fillCard', { card: ordered });
    });
    // opponent entries never carry a card
    for (const opp of snapA.view!.opponents) {
      expect((opp as Record<string, unknown>).card).toBeUndefined();
    }
  });

  it('auto-advances a stalled human turn via the turn timeout', async () => {
    // Tiny turnMs so the human turn-timeout fires quickly; the human NEVER calls manually.
    const srv = await startTestServer({ maxPlayers: 6, minPlayers: 2, turnMs: 30, botDelayMs: 5, revealMs: 20 });
    try {
      const a = ioClient(`http://localhost:${srv.port}`);
      clients.push(a);

      const created = await emit<{ ok: true; code: string; playerId: string }>(a, 'room:create', { name: 'An' });
      await emit(a, 'room:addBot', { difficulty: 'easy' });
      await emit(a, 'room:start');
      await emit(a, 'player:fillCard', { card: ordered });

      const finished = new Promise<{ winnerId: string }>((resolve) => a.on('game:finished', resolve));
      await emit(a, 'player:ready'); // starts play

      // 'a' never calls; its turns must be auto-called by the 30ms turn timeout,
      // and the bot auto-plays its turns — the game must still finish.
      const result = await Promise.race([finished, delay(4000).then(() => null)]);
      expect(result).not.toBeNull();
    } finally {
      await srv.close();
    }
  });

  it('includes turn deadline timestamps in the snapshot while playing', async () => {
    const a = connect();
    const b = connect();
    const created = await emit<{ ok: true; code: string; playerId: string }>(a, 'room:create', { name: 'An' });
    await emit(b, 'room:join', { code: created.code, name: 'Bình' });
    await emit(a, 'room:start');
    await emit(a, 'player:fillCard', { card: ordered });
    await emit(a, 'player:ready');
    await emit(b, 'player:fillCard', { card: ordered });

    const playingSnap = await new Promise<RoomSnapshot>((resolve) => {
      a.on('room:state', (s: RoomSnapshot) => {
        if (s.status === 'playing') resolve(s);
      });
      void emit(b, 'player:ready'); // transitions to playing
    });

    expect(typeof playingSnap.turnStartedAt).toBe('number');
    expect(typeof playingSnap.turnEndsAt).toBe('number');
    expect(playingSnap.turnEndsAt!).toBeGreaterThan(playingSnap.turnStartedAt!);
  });

  it('room-list subscribers get the open rooms and live updates', async () => {
    const browser = connect();
    // No rooms yet.
    const initial = await emit<Array<{ code: string; hostName: string }>>(browser, 'rooms:subscribe');
    expect(initial).toEqual([]);

    // Someone opens a room -> subscribers get a rooms:list push.
    const pushed = new Promise<Array<{ code: string; hostName: string }>>((resolve) => {
      browser.on('rooms:list', (rooms) => {
        if (rooms.length > 0) resolve(rooms);
      });
    });
    const host = connect();
    await emit(host, 'room:create', { name: 'An' });

    const list = await Promise.race([pushed, delay(1500).then(() => null)]);
    expect(list).not.toBeNull();
    expect(list![0]).toMatchObject({ hostName: 'An' });
  });

  it('host can start a new game after finish, returning the room to lobby', async () => {
    const a = connect();
    const created = await emit<{ ok: true; code: string; playerId: string }>(a, 'room:create', { name: 'An' });
    await emit(a, 'room:addBot', { difficulty: 'easy' });
    await emit(a, 'room:start');
    await emit(a, 'player:fillCard', { card: ordered });

    const finished = new Promise<void>((resolve) => a.on('game:finished', () => resolve()));
    let snap: RoomSnapshot | undefined;
    a.on('room:state', (s: RoomSnapshot) => { snap = s; });
    await emit(a, 'player:ready');

    // 'a' calls on its turns; bot auto-plays until someone wins.
    for (let i = 0; i < 40; i++) {
      const s = snap;
      if (s?.status === 'finished') break;
      if (s?.status === 'playing' && s.view?.currentPlayerId === created.playerId) {
        const next = ordered.find((n) => !s.view!.calledNumbers.includes(n));
        if (next) await emit(a, 'game:call', { n: next });
      }
      await delay(15);
    }
    await Promise.race([finished, delay(2000)]);

    // Now start a new game -> back to lobby.
    const backToLobby = new Promise<RoomSnapshot>((resolve) => {
      a.on('room:state', (s: RoomSnapshot) => { if (s.status === 'lobby') resolve(s); });
    });
    const r = await emit<{ ok: boolean }>(a, 'room:newGame');
    expect(r.ok).toBe(true);
    const lobby = await Promise.race([backToLobby, delay(1500).then(() => null)]);
    expect(lobby).not.toBeNull();
    expect(lobby!.status).toBe('lobby');
  });

  it('reports the room turn time in the snapshot and uses it for the timer', async () => {
    const a = connect();
    const b = connect();
    const created = await emit<{ ok: true; code: string }>(a, 'room:create', { name: 'An', turnMs: 15_000 });
    await emit(b, 'room:join', { code: created.code, name: 'Bình' });
    await emit(a, 'room:start');
    await emit(a, 'player:fillCard', { card: ordered });
    await emit(a, 'player:ready');
    await emit(b, 'player:fillCard', { card: ordered });

    const snap = await new Promise<RoomSnapshot>((resolve) => {
      a.on('room:state', (s: RoomSnapshot) => { if (s.status === 'playing') resolve(s); });
      void emit(b, 'player:ready');
    });
    expect(snap.turnMs).toBe(15_000);
    expect(snap.rolling).toBe(false);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
