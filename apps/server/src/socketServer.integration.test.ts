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
  const manager = new RoomManager(store, { maxPlayers: 6, minPlayers: 2, turnMs: 60_000, botDelayMs: 5 });
  attachSocketServer(io, manager, store, { maxPlayers: 6, minPlayers: 2, turnMs: 60_000, botDelayMs: 5 });
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
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
