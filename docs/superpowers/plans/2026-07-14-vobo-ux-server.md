# Vobo UX Tweaks — Server Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the server-side support for the v2 UX tweaks: a turn deadline in the snapshot (for the client's countdown border), a "return to lobby / new game" transition, and a public room list — all in `apps/server`, leaving `@vobo/game-engine` untouched.

**Architecture:** Additive changes to the existing authoritative server. New `RoomManager` methods (`returnToLobby`, `listOpenRooms`) and a `RoomStore.values()` enumerator stay pure/unit-tested; the socket layer records the turn deadline on each turn, exposes a `@lobby` broadcast group for the room list, and adds a `room:newGame` handler. TDD throughout.

**Tech Stack:** TypeScript (strict + noUncheckedIndexedAccess), Node, Socket.IO, Vitest. Spec: `docs/superpowers/specs/2026-07-14-vobo-ux-tweaks-design.md`.

**Context — current shapes (do not re-derive):**
- `RoomManager` (`src/roomManager.ts`) has `createRoom/joinRoom/addBot/startGame/fillCard/setReady/callNumber/currentPlayer/botCall/autoCall/attachSocket/markDisconnected/resume/leave` and a module-level `fail(code,message)` helper.
- `Room` (`src/types.ts`): `{ code, hostId, gameId:'bingo', roster: PlayerSeat[], state?: BingoState, seats: Map<string,Seat>, rng, botRng }`. Bots have id starting `bot_`; humans `p_` and a seat.
- `socketServer.ts` has `snapshotFor(room, playerId)`, `broadcast(code)`, `orchestrate(code)`, and per-socket handlers; `orchestrate` (re)starts one turn timer per room.
- Config (`src/config.ts`): `RoomConfig { maxPlayers, minPlayers, turnMs, botDelayMs }`, `DEFAULT_CONFIG`.

---

## File Structure

```
apps/server/src/
├─ types.ts          # + OpenRoom, + Room.turnStartedAt/turnEndsAt?, + RoomSnapshot.turn*, + new events
├─ roomStore.ts      # + values()
├─ roomManager.ts    # + listOpenRooms(), returnToLobby()
├─ socketServer.ts   # + turn deadline in orchestrate/snapshotFor, @lobby room list, room:newGame
└─ *.test.ts         # new/extended tests colocated
```

---

## Task 1: Types — OpenRoom, new events, Room turn fields

**Files:**
- Modify: `apps/server/src/types.ts`

Additive types only (nothing breaks). The `RoomSnapshot` turn fields are added later (Task 5) together with the code that fills them.

- [ ] **Step 1: Add `turnStartedAt?`/`turnEndsAt?` to `Room`.** In `src/types.ts`, change the `Room` interface's tail:

```ts
  seats: Map<string, Seat>; // playerId -> auth/connection (HUMANS only; bots have no seat)
  rng: Rng; // engine RNG (card generation)
  botRng: Rng; // bot decision RNG
  turnStartedAt?: number; // epoch ms when the current turn began (playing only)
  turnEndsAt?: number; // epoch ms deadline for the current turn (playing only)
}
```

- [ ] **Step 2: Add the `OpenRoom` type.** Insert after the `RosterEntry` interface:

```ts
/** A joinable room shown in the landing-page room list. */
export interface OpenRoom {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
}
```

- [ ] **Step 3: Add the new client→server events.** Inside `ClientToServerEvents`, after the `'room:leave'` line:

```ts
  'room:newGame': (ack: (r: Ack<OkAck>) => void) => void;
  'rooms:subscribe': (ack: (rooms: OpenRoom[]) => void) => void;
  'rooms:unsubscribe': (ack: (r: OkAck) => void) => void;
```

- [ ] **Step 4: Add the new server→client event.** Inside `ServerToClientEvents`, after the `'error'` line:

```ts
  'rooms:list': (rooms: OpenRoom[]) => void;
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @vobo/server typecheck`
Expected: no errors. Then confirm tests still green: `pnpm --filter @vobo/server test` → 32 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/types.ts
git commit -m "feat(server): add OpenRoom, room turn-deadline fields, new socket events"
```

---

## Task 2: RoomStore.values()

**Files:**
- Modify: `apps/server/src/roomStore.ts`
- Test: `apps/server/src/roomStore.test.ts`

- [ ] **Step 1: Add the failing test.** Append inside the existing `describe('InMemoryRoomStore', ...)` block in `src/roomStore.test.ts`:

```ts
  it('values() lists all rooms', () => {
    const store = new InMemoryRoomStore();
    store.create(makeRoom('AAA'));
    store.create(makeRoom('BBB'));
    expect(store.values().map((r) => r.code).sort()).toEqual(['AAA', 'BBB']);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/roomStore.test.ts`
Expected: FAIL — `store.values is not a function`.

- [ ] **Step 3: Implement.** In `src/roomStore.ts`, add `values(): Room[];` to the `RoomStore` interface (after `delete`), and this method to `InMemoryRoomStore` (after `delete`):

```ts
  values(): Room[] {
    return [...this.rooms.values()];
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/roomStore.test.ts`
Then: `pnpm --filter @vobo/server typecheck`
Expected: PASS (3 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/roomStore.ts apps/server/src/roomStore.test.ts
git commit -m "feat(server): RoomStore.values() to enumerate rooms"
```

---

## Task 3: RoomManager.listOpenRooms()

**Files:**
- Modify: `apps/server/src/roomManager.ts`
- Test: `apps/server/src/roomManager.rooms.test.ts`

- [ ] **Step 1: Write the failing test** — `src/roomManager.rooms.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.rooms.test.ts`
Expected: FAIL — `m.listOpenRooms is not a function`.

- [ ] **Step 3: Implement.** In `src/roomManager.ts`:

(a) Add `OpenRoom` to the type import from `./types`. Change:
```ts
import type { OpResult, Room } from './types';
```
to:
```ts
import type { OpResult, OpenRoom, Room } from './types';
```

(b) Add this method to the `RoomManager` class (e.g. after `leave`):
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.rooms.test.ts`
Then: `pnpm --filter @vobo/server typecheck`
Expected: PASS (2 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/roomManager.ts apps/server/src/roomManager.rooms.test.ts
git commit -m "feat(server): RoomManager.listOpenRooms()"
```

---

## Task 4: RoomManager.returnToLobby()

**Files:**
- Modify: `apps/server/src/roomManager.ts`
- Test: `apps/server/src/roomManager.newgame.test.ts`

- [ ] **Step 1: Write the failing test** — `src/roomManager.newgame.test.ts`

```ts
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

  it('rejects non-host and not-finished', () => {
    const { m, code, host } = finishedRoom();
    expect(m.returnToLobby(code, 'ghost')).toMatchObject({ ok: false, code: 'not_host' });

    // a fresh lobby room (never started) -> not_finished
    const store2 = new InMemoryRoomStore();
    const m2 = new RoomManager(store2, DEFAULT_CONFIG);
    const a = m2.createRoom('An');
    expect(m2.returnToLobby(a.code, a.playerId)).toMatchObject({ ok: false, code: 'not_finished' });
    void code;
    void host;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.newgame.test.ts`
Expected: FAIL — `m.returnToLobby is not a function`.

- [ ] **Step 3: Implement.** Add this method to the `RoomManager` class in `src/roomManager.ts` (after `listOpenRooms`):

```ts
  /** Host resets a finished game back to the room lobby, ready for another game. */
  returnToLobby(code: string, hostId: string): OpResult {
    const room = this.store.get(code);
    if (!room) return fail('no_room', 'Không tìm thấy phòng');
    if (room.hostId !== hostId) return fail('not_host', 'Chỉ chủ phòng mới mở ván mới');
    if (!room.state || room.state.phase !== 'finished') {
      return fail('not_finished', 'Ván chưa kết thúc');
    }
    // Keep still-present players: connected humans (have a seat) + real bots (id 'bot_').
    room.roster = room.state.players
      .filter((p) => room.seats.has(p.id) || p.id.startsWith('bot_'))
      .map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, botDifficulty: p.botDifficulty }));
    room.state = undefined;
    room.turnStartedAt = undefined;
    room.turnEndsAt = undefined;
    return { ok: true };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.newgame.test.ts`
Then: `pnpm --filter @vobo/server typecheck`
Expected: PASS (2 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/roomManager.ts apps/server/src/roomManager.newgame.test.ts
git commit -m "feat(server): RoomManager.returnToLobby() for new-game reset"
```

---

## Task 5: Turn deadline in the snapshot

**Files:**
- Modify: `apps/server/src/types.ts`
- Modify: `apps/server/src/socketServer.ts`
- Test: `apps/server/src/socketServer.integration.test.ts`

Adds `turnStartedAt`/`turnEndsAt` to the pushed snapshot: set when a turn starts, `null` outside `playing`.

- [ ] **Step 1: Add the failing test.** Append this test INSIDE the existing `describe('socket server (end-to-end)', ...)` block in `src/socketServer.integration.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/socketServer.integration.test.ts`
Expected: FAIL — typecheck/property error: `turnStartedAt`/`turnEndsAt` do not exist on `RoomSnapshot` (and would be `undefined` at runtime).

- [ ] **Step 3a: Add the fields to `RoomSnapshot`.** In `src/types.ts`, change the `RoomSnapshot` interface tail:

```ts
  roster: RosterEntry[];
  view: BingoView | null; // null during lobby; player-specific once started
  turnStartedAt: number | null; // epoch ms; set only while playing
  turnEndsAt: number | null; // epoch ms; set only while playing
}
```

- [ ] **Step 3b: Record the deadline in `orchestrate`.** In `src/socketServer.ts`, replace the current-player timer block inside `orchestrate` (the `const cur = manager.currentPlayer(room); ...` section) with:

```ts
    const cur = manager.currentPlayer(room);
    if (!cur) return;
    const now = Date.now();
    room.turnStartedAt = now;
    room.turnEndsAt = now + (cur.isBot ? cfg.botDelayMs : cfg.turnMs);
    if (cur.isBot) {
      turnTimers.set(code, setTimeout(() => { manager.botCall(code); orchestrate(code); }, cfg.botDelayMs));
    } else {
      turnTimers.set(code, setTimeout(() => { manager.autoCall(code); orchestrate(code); }, cfg.turnMs));
    }
```

Also clear the deadline when a game finishes: in `orchestrate`, change the `finished` branch:

```ts
    if (room.state.phase === 'finished') {
      room.turnStartedAt = undefined;
      room.turnEndsAt = undefined;
      io.to(code).emit('game:finished', { winnerId: room.state.winners[0]! });
      return;
    }
```

- [ ] **Step 3c: Expose the deadline in `snapshotFor`.** In `src/socketServer.ts`, change the `snapshotFor` return object to add the two fields (only meaningful while playing):

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/socketServer.integration.test.ts`
Then: `pnpm --filter @vobo/server typecheck`
Expected: all integration tests PASS (including the new one), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/types.ts apps/server/src/socketServer.ts apps/server/src/socketServer.integration.test.ts
git commit -m "feat(server): expose per-turn deadline (turnStartedAt/turnEndsAt) in snapshot"
```

---

## Task 6: Public room list over the `@lobby` group

**Files:**
- Modify: `apps/server/src/socketServer.ts`
- Test: `apps/server/src/socketServer.integration.test.ts`

- [ ] **Step 1: Add the failing test.** Append INSIDE the existing `describe('socket server (end-to-end)', ...)` block:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/socketServer.integration.test.ts`
Expected: FAIL — the `rooms:subscribe` ack never returns / `rooms:list` never fires (handlers not implemented).

- [ ] **Step 3a: Add a `broadcastRooms` helper.** In `src/socketServer.ts`, inside `attachSocketServer`, add after the `broadcast` function:

```ts
  const LOBBY = '@lobby';
  function broadcastRooms(): void {
    io.to(LOBBY).emit('rooms:list', manager.listOpenRooms());
  }
```

- [ ] **Step 3b: Call `broadcastRooms()` after every open-list-affecting change.** In `src/socketServer.ts`, add a `broadcastRooms();` call at the end of the success paths of these handlers: `room:create` (after `broadcast(code)`), `room:join` (after `broadcast(code)`), `room:start` (after `orchestrate(c.code)`), and `room:leave` (after the orchestrate/clearTurnTimer branch, before resetting `conn`). Concretely:

- In `room:create`, change the tail to:
```ts
      ack({ ok: true, code, playerId, token });
      broadcast(code);
      broadcastRooms();
```
- In `room:join`, change the tail to:
```ts
      ack({ ok: true, playerId: r.playerId, token: r.token });
      broadcast(code);
      broadcastRooms();
```
- In `room:start`, change the success line to:
```ts
      if (r.ok) { orchestrate(c.code); broadcastRooms(); }
```
- In `room:leave`, change the block to:
```ts
      if (r.ok && !r.roomDeleted) orchestrate(c.code);
      else if (r.ok && r.roomDeleted) clearTurnTimer(c.code);
      if (r.ok) broadcastRooms();
      void socket.leave(c.code);
```

- [ ] **Step 3c: Add the subscribe/unsubscribe handlers.** In `src/socketServer.ts`, add inside `io.on('connection', ...)` (e.g. right before the `disconnect` handler):

```ts
    socket.on('rooms:subscribe', (ack) => {
      void socket.join(LOBBY);
      ack(manager.listOpenRooms());
    });

    socket.on('rooms:unsubscribe', (ack) => {
      void socket.leave(LOBBY);
      ack({ ok: true });
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/socketServer.integration.test.ts`
Then: `pnpm --filter @vobo/server typecheck`
Expected: all PASS, typecheck clean. (If flaky, raise the `delay(1500)` race — but the push must genuinely arrive.)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/socketServer.ts apps/server/src/socketServer.integration.test.ts
git commit -m "feat(server): @lobby room-list subscription + live updates"
```

---

## Task 7: `room:newGame` handler

**Files:**
- Modify: `apps/server/src/socketServer.ts`
- Test: `apps/server/src/socketServer.integration.test.ts`

- [ ] **Step 1: Add the failing test.** Append INSIDE the existing `describe('socket server (end-to-end)', ...)` block:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/socketServer.integration.test.ts`
Expected: FAIL — `room:newGame` ack never returns (handler missing).

- [ ] **Step 3: Add the handler.** In `src/socketServer.ts`, add inside `io.on('connection', ...)` (e.g. after the `room:leave` handler):

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/socketServer.integration.test.ts`
Then the FULL server suite: `pnpm --filter @vobo/server test`
Then: `pnpm --filter @vobo/server typecheck`
Expected: all PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/socketServer.ts apps/server/src/socketServer.integration.test.ts
git commit -m "feat(server): room:newGame handler (finished -> lobby)"
```

---

## Self-Review

**Spec coverage (server portions of §2):**
- `RoomSnapshot.turnStartedAt/turnEndsAt` → Task 5 ✅
- `OpenRoom` type + new events → Task 1 ✅
- `Room.turnStartedAt/turnEndsAt` → Task 1 ✅
- `RoomStore.values()` → Task 2 ✅
- `RoomManager.listOpenRooms()` → Task 3 ✅
- `RoomManager.returnToLobby()` (keep bots + connected humans, drop leavers; host-only; finished-only) → Task 4 ✅
- `orchestrate` sets/clears the deadline; `snapshotFor` exposes it → Task 5 ✅
- `@lobby` group: `broadcastRooms`, `rooms:subscribe`/`unsubscribe`, calls after create/join/start/leave/newGame → Tasks 6, 7 ✅
- `room:newGame` handler → Task 7 ✅

**Placeholder scan:** none. Every modify step shows the exact code.

**Type consistency:** `OpenRoom {code,hostName,playerCount,maxPlayers}` is defined in Task 1 and produced identically in Task 3; the `rooms:subscribe` ack and `rooms:list` payloads both carry `OpenRoom[]`. `returnToLobby`/`listOpenRooms` return `OpResult`/`OpenRoom[]` matching the socket handlers. `turnStartedAt/turnEndsAt` are `number | null` in `RoomSnapshot` (Task 5) and `number | undefined` on `Room` (Task 1), bridged by `?? null` in `snapshotFor`.

Note: web-side changes (carousel, tap-to-call, room list UI, new-game button) are a **separate plan** (`2026-07-14-vobo-ux-web.md`), written after this server layer exists so it references the real snapshot fields and events.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-14-vobo-ux-server.md`. This is the **server plan** (1 of 2 for the v2 tweaks); the web plan follows.

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.

**2. Inline Execution** — execute in this session with checkpoints.

Which approach?
