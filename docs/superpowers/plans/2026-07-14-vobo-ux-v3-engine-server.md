# Vobo UX v3 — Engine + Server Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Back-end support for the v3 tweaks: shuffled turn order with an optional forced first player (engine), and per-room turn time + a fair "rolling" dice-reveal phase + previous-winner-goes-first (server).

**Architecture:** The engine's `createInitialState` gains an optional `{ firstPlayerId }` and computes a shuffled `turnOrder` up front (the setup→playing transition stops seeding it). The server stores a per-room `turnMs`, tracks `lastWinnerId`, and runs a short server-timed `rolling` window at each game start (no turn timer, calls blocked) before the first turn. TDD throughout.

**Tech Stack:** TypeScript (strict + noUncheckedIndexedAccess), Vitest, Socket.IO. Spec: `docs/superpowers/specs/2026-07-14-vobo-ux-v3-design.md`. Built on `main` (has v2 + the TurnRing clock-skew fix).

**Context — current shapes:**
- Engine `GameModule.createInitialState(players, rng): S` (`packages/game-engine/src/engine.ts:14`); Bingo impl at `src/bingo/state.ts`; `setReady` seeds `turnOrder` at `src/bingo/apply.ts:31`.
- Server `RoomConfig { maxPlayers, minPlayers, turnMs, botDelayMs }` (`src/config.ts`); `Room` has `turnStartedAt?/turnEndsAt?` already; `RoomSnapshot` has `turnStartedAt/turnEndsAt`; `orchestrate` in `src/socketServer.ts` starts the per-turn timer and records the deadline; `RoomManager.createRoom(name)`, `startGame`, `returnToLobby` in `src/roomManager.ts`.

---

## File Structure

```
packages/game-engine/src/
├─ engine.ts            # GameModule.createInitialState gains opts
├─ bingo/state.ts       # createInitialState computes shuffled turnOrder (+ firstPlayerId)
└─ bingo/apply.ts       # setReady stops seeding turnOrder
apps/server/src/
├─ config.ts            # + revealMs, TURN_PRESETS_MS
├─ types.ts             # Room.turnMs/lastWinnerId/rolling/revealDone; RoomSnapshot.turnMs/rolling; CreatePayload.turnMs
├─ roomManager.ts       # createRoom(name,turnMs); startGame passes firstPlayerId; reset flags
└─ socketServer.ts      # snapshot turnMs/rolling; orchestrate per-room turnMs + rolling reveal + lastWinnerId; call blocked while rolling
```

---

## Task 1: Engine — createInitialState computes a shuffled turn order

**Files:**
- Modify: `packages/game-engine/src/engine.ts`
- Modify: `packages/game-engine/src/bingo/state.ts`
- Test: `packages/game-engine/src/bingo/state.test.ts`

- [ ] **Step 1: Update the failing tests** — overwrite the body of `state.test.ts` to expect a shuffled order and the `firstPlayerId` option. Replace the whole file with:

```ts
import { describe, it, expect } from 'vitest';
import { createInitialState } from './state';
import { isValidCard } from './setup';
import { createRng } from '../rng';
import type { PlayerSeat } from '../types';

const seats: PlayerSeat[] = [
  { id: 'h1', name: 'An', isBot: false },
  { id: 'b1', name: 'Bot K', isBot: true, botDifficulty: 'medium' },
];

describe('createInitialState', () => {
  it('starts in setup phase with a turn order that is a permutation of the players', () => {
    const s = createInitialState(seats, createRng(1));
    expect(s.phase).toBe('setup');
    expect(s.calledNumbers).toEqual([]);
    expect([...s.turnOrder].sort()).toEqual(['b1', 'h1']);
    expect(s.currentTurn).toBe(0);
    expect(s.winners).toEqual([]);
  });

  it('is deterministic for a given seed', () => {
    expect(createInitialState(seats, createRng(7)).turnOrder).toEqual(
      createInitialState(seats, createRng(7)).turnOrder,
    );
  });

  it('puts firstPlayerId at the front when it is present', () => {
    const three: PlayerSeat[] = [
      { id: 'a', name: 'A', isBot: false },
      { id: 'b', name: 'B', isBot: false },
      { id: 'c', name: 'C', isBot: false },
    ];
    const s = createInitialState(three, createRng(3), { firstPlayerId: 'c' });
    expect(s.turnOrder[0]).toBe('c');
    expect([...s.turnOrder].sort()).toEqual(['a', 'b', 'c']);
  });

  it('ignores an unknown firstPlayerId (still a valid order)', () => {
    const s = createInitialState(seats, createRng(3), { firstPlayerId: 'ghost' });
    expect([...s.turnOrder].sort()).toEqual(['b1', 'h1']);
  });

  it('gives bots a valid card and marks them ready; humans start empty and not ready', () => {
    const s = createInitialState(seats, createRng(1));
    const human = s.players.find((p) => p.id === 'h1')!;
    const bot = s.players.find((p) => p.id === 'b1')!;
    expect(human.card).toEqual([]);
    expect(human.ready).toBe(false);
    expect(isValidCard(bot.card)).toBe(true);
    expect(bot.ready).toBe(true);
  });

  it('marks all players connected with 0 completed lines', () => {
    const s = createInitialState(seats, createRng(1));
    for (const p of s.players) {
      expect(p.connected).toBe(true);
      expect(p.completedLines).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/state.test.ts`
Expected: FAIL — turnOrder is `[]` (empty) and `createInitialState` takes no `opts`.

- [ ] **Step 3: Update the `GameModule` interface** — in `packages/game-engine/src/engine.ts`, change:
```ts
  createInitialState(players: PlayerSeat[], rng: Rng): S;
```
to:
```ts
  createInitialState(players: PlayerSeat[], rng: Rng, opts?: { firstPlayerId?: string }): S;
```

- [ ] **Step 4: Rewrite `bingo/state.ts`**

```ts
import type { PlayerSeat, Rng } from '../types';
import type { BingoState, BingoPlayer } from './types';
import { randomCard } from './setup';

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

export function createInitialState(
  players: PlayerSeat[],
  rng: Rng,
  opts?: { firstPlayerId?: string },
): BingoState {
  const bingoPlayers: BingoPlayer[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    botDifficulty: p.botDifficulty,
    card: p.isBot ? randomCard(rng) : [],
    ready: p.isBot,
    completedLines: 0,
    connected: true,
  }));

  let turnOrder = shuffle(
    players.map((p) => p.id),
    rng,
  );
  const first = opts?.firstPlayerId;
  if (first && turnOrder.includes(first)) {
    turnOrder = [first, ...turnOrder.filter((id) => id !== first)];
  }

  return {
    phase: 'setup',
    players: bingoPlayers,
    turnOrder,
    currentTurn: 0,
    calledNumbers: [],
    winners: [],
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/state.test.ts`
Then typecheck: `pnpm --filter @vobo/game-engine typecheck`
Expected: PASS (6 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/src/engine.ts packages/game-engine/src/bingo/state.ts packages/game-engine/src/bingo/state.test.ts
git commit -m "feat(engine): createInitialState shuffles turn order with optional firstPlayerId"
```

---

## Task 2: Engine — setReady stops seeding turnOrder

**Files:**
- Modify: `packages/game-engine/src/bingo/apply.ts`
- Test: `packages/game-engine/src/bingo/apply.setup.test.ts`

Now that `createInitialState` owns `turnOrder`, the setup→playing transition must not overwrite it.

- [ ] **Step 1: Update the failing test** — in `apply.setup.test.ts`, the test `transitions to playing when the last player readies, seeding turnOrder` asserts `turnOrder` equals `['a', 'b']`. Since `setReady` no longer seeds it (and this test's fixture starts with `turnOrder: []`), replace that test with:

```ts
  it('transitions to playing when the last player readies (turnOrder is set by createInitialState, not here)', () => {
    let s = twoHumanSetup();
    s = applyMove(s, 'a', { type: 'FillCard', card: ordered });
    s = applyMove(s, 'a', { type: 'SetReady' });
    s = applyMove(s, 'b', { type: 'FillCard', card: ordered });
    s = applyMove(s, 'b', { type: 'SetReady' });
    expect(s.phase).toBe('playing');
    expect(s.currentTurn).toBe(0);
    expect(s.turnOrder).toEqual([]); // fixture never set it; setReady no longer seeds it
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/apply.setup.test.ts`
Expected: FAIL — current `setReady` sets `turnOrder` to `['a','b']`, so `expect(s.turnOrder).toEqual([])` fails.

- [ ] **Step 3: Edit `bingo/apply.ts`** — in `setReady`, change the transition return from:
```ts
  if (!allReady) return { ...state, players };
  return {
    ...state,
    players,
    phase: 'playing',
    turnOrder: players.map((p) => p.id),
    currentTurn: 0,
  };
```
to (drop the `turnOrder` line; `currentTurn` stays 0, which `createInitialState` already set):
```ts
  if (!allReady) return { ...state, players };
  return {
    ...state,
    players,
    phase: 'playing',
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/apply.setup.test.ts`
Then the FULL engine suite (the full-game integration test drives turns off `turnOrder`, which is now the shuffled order — it must still pass): `pnpm --filter @vobo/game-engine test`
Then typecheck: `pnpm --filter @vobo/game-engine typecheck`
Expected: all PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/bingo/apply.ts packages/game-engine/src/bingo/apply.setup.test.ts
git commit -m "feat(engine): setReady no longer seeds turnOrder (owned by createInitialState)"
```

---

## Task 3: Server — config presets + room turn/rolling fields

**Files:**
- Modify: `apps/server/src/config.ts`
- Modify: `apps/server/src/types.ts`
- Modify: `apps/server/src/roomManager.ts`
- Modify: `apps/server/src/roomStore.test.ts`

Additive: adds the fields and default-wires them so everything still compiles. (`RoomSnapshot.turnMs/rolling` come in Task 5.)

- [ ] **Step 1: Edit `config.ts`** — add `revealMs` to the config and export the presets:

```ts
export interface RoomConfig {
  maxPlayers: number;
  minPlayers: number;
  turnMs: number; // default per-turn timeout when a room doesn't pick one
  botDelayMs: number; // delay before a bot plays its turn (feels human)
  revealMs: number; // "rolling" dice-reveal window before the first turn of a game
}

export const DEFAULT_CONFIG: RoomConfig = {
  maxPlayers: 6,
  minPlayers: 2,
  turnMs: 20_000,
  botDelayMs: 1_200,
  revealMs: 1_500,
};

/** Turn-time choices offered when creating a room (ms). */
export const TURN_PRESETS_MS = [15_000, 20_000, 30_000, 45_000, 60_000];
```

- [ ] **Step 2: Edit `types.ts`** — add the new `Room` fields. Change the `Room` interface tail:
```ts
  rng: Rng; // engine RNG (card generation)
  botRng: Rng; // bot decision RNG
  turnStartedAt?: number;
  turnEndsAt?: number;
```
to:
```ts
  rng: Rng; // engine RNG (card generation)
  botRng: Rng; // bot decision RNG
  turnStartedAt?: number;
  turnEndsAt?: number;
  turnMs: number; // this room's per-turn time
  lastWinnerId?: string; // winner of the previous game (goes first next game)
  rolling?: boolean; // true during the dice-reveal window at game start
  revealDone?: boolean; // whether the reveal already ran for the current game
```
Also add `turnMs?` to `CreatePayload`. Change:
```ts
export interface CreatePayload { name: string; }
```
to:
```ts
export interface CreatePayload { name: string; turnMs?: number; }
```

- [ ] **Step 3: Default-wire `turnMs` in `createRoom`** — in `roomManager.ts`, the `createRoom` method builds a `Room`. Add `turnMs: this.cfg.turnMs,` to that object literal (right after `botRng: createRng(...)`):
```ts
      rng: createRng(seed),
      botRng: createRng(seed ^ 0x9e3779b9),
      turnMs: this.cfg.turnMs,
```

- [ ] **Step 4: Fix the RoomStore test fixture** — in `roomStore.test.ts`, the `makeRoom(code)` helper builds a `Room` literal. Add `turnMs: 20_000,` to it (e.g. after `botRng: createRng(2),`) so it satisfies the now-required field.

- [ ] **Step 5: Fix the integration-test config literals** — adding required `revealMs` to `RoomConfig` breaks every `RoomConfig` literal at typecheck. In `apps/server/src/socketServer.integration.test.ts`:
  - In the `startTestServer` helper, its `cfg` parameter is typed inline as `{ maxPlayers: number; minPlayers: number; turnMs: number; botDelayMs: number }` — add `revealMs: number;` to that type.
  - Every `RoomConfig` object literal in the file (the two in `beforeEach` passed to `new RoomManager(...)` and `attachSocketServer(...)`, plus any passed to `startTestServer({...})` inside individual tests) must include `revealMs`. Add `revealMs: 20` to each so pre-existing tests don't wait on a reveal (the rolling phase isn't wired until Task 7, so this value is harmless here).

- [ ] **Step 6: Typecheck + tests**

Run: `pnpm --filter @vobo/server typecheck`
Then: `pnpm --filter @vobo/server test`
Expected: no errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/config.ts apps/server/src/types.ts apps/server/src/roomManager.ts apps/server/src/roomStore.test.ts apps/server/src/socketServer.integration.test.ts
git commit -m "feat(server): add room turn/rolling fields, turn presets, reveal config"
```

---

## Task 4: Server — createRoom picks the turn time

**Files:**
- Modify: `apps/server/src/roomManager.ts`
- Modify: `apps/server/src/socketServer.ts`
- Test: `apps/server/src/roomManager.turntime.test.ts`

- [ ] **Step 1: Write the failing test** — `roomManager.turntime.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

describe('RoomManager.createRoom turn time', () => {
  it('uses a valid preset when given one', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, DEFAULT_CONFIG);
    const { code } = m.createRoom('An', 45_000);
    expect(store.get(code)!.turnMs).toBe(45_000);
  });

  it('falls back to the default for a missing or invalid value', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, DEFAULT_CONFIG);
    expect(store.get(m.createRoom('A').code)!.turnMs).toBe(20_000);
    expect(store.get(m.createRoom('B', 999).code)!.turnMs).toBe(20_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.turntime.test.ts`
Expected: FAIL — `createRoom` ignores the second argument (always `cfg.turnMs`).

- [ ] **Step 3: Implement** — in `roomManager.ts`:

(a) Import the presets. Change:
```ts
import type { RoomConfig } from './config';
```
to:
```ts
import type { RoomConfig } from './config';
import { TURN_PRESETS_MS } from './config';
```

(b) Change the `createRoom` signature and the `turnMs` it stores. Change:
```ts
  createRoom(name: string): { code: string; playerId: string; token: string } {
```
to:
```ts
  createRoom(name: string, turnMs?: number): { code: string; playerId: string; token: string } {
```
and change the object literal line `turnMs: this.cfg.turnMs,` to:
```ts
      turnMs: turnMs !== undefined && TURN_PRESETS_MS.includes(turnMs) ? turnMs : this.cfg.turnMs,
```

- [ ] **Step 4: Pass `turnMs` from the socket** — in `socketServer.ts`, change the `room:create` handler's first line from:
```ts
    socket.on('room:create', ({ name }, ack) => {
      const { code, playerId, token } = manager.createRoom(name);
```
to:
```ts
    socket.on('room:create', ({ name, turnMs }, ack) => {
      const { code, playerId, token } = manager.createRoom(name, turnMs);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.turntime.test.ts`
Then: `pnpm --filter @vobo/server typecheck`
Expected: PASS (2 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/roomManager.ts apps/server/src/socketServer.ts apps/server/src/roomManager.turntime.test.ts
git commit -m "feat(server): createRoom accepts a turn-time preset"
```

---

## Task 5: Server — snapshot turnMs/rolling + per-room turn timer

**Files:**
- Modify: `apps/server/src/types.ts`
- Modify: `apps/server/src/socketServer.ts`
- Test: `apps/server/src/socketServer.integration.test.ts`

- [ ] **Step 1: Add the failing test** — append INSIDE the existing `describe('socket server (end-to-end)', ...)` block:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/socketServer.integration.test.ts`
Expected: FAIL — `turnMs`/`rolling` are not on `RoomSnapshot`.

- [ ] **Step 3a: Add the snapshot fields** — in `types.ts`, change the `RoomSnapshot` tail:
```ts
  turnStartedAt: number | null; // epoch ms; set only while playing
  turnEndsAt: number | null; // epoch ms; set only while playing
}
```
to:
```ts
  turnStartedAt: number | null; // epoch ms; set only while playing
  turnEndsAt: number | null; // epoch ms; set only while playing
  turnMs: number; // this room's per-turn time
  rolling: boolean; // true during the dice-reveal window
}
```

- [ ] **Step 3b: Expose them in `snapshotFor`** — in `socketServer.ts`, add to the `snapshotFor` return object (after the `turnEndsAt:` line):
```ts
      turnMs: room.turnMs,
      rolling: room.state?.phase === 'playing' ? (room.rolling ?? false) : false,
```

- [ ] **Step 3c: Use the room's turn time in `orchestrate`** — in `socketServer.ts`, in the normal-turn section of `orchestrate`, change:
```ts
    room.turnEndsAt = now + (cur.isBot ? cfg.botDelayMs : cfg.turnMs);
    broadcast(code);
    if (cur.isBot) {
      turnTimers.set(code, setTimeout(() => { manager.botCall(code); orchestrate(code); }, cfg.botDelayMs));
    } else {
      turnTimers.set(code, setTimeout(() => { manager.autoCall(code); orchestrate(code); }, cfg.turnMs));
    }
```
to:
```ts
    room.turnEndsAt = now + (cur.isBot ? cfg.botDelayMs : room.turnMs);
    broadcast(code);
    if (cur.isBot) {
      turnTimers.set(code, setTimeout(() => { manager.botCall(code); orchestrate(code); }, cfg.botDelayMs));
    } else {
      turnTimers.set(code, setTimeout(() => { manager.autoCall(code); orchestrate(code); }, room.turnMs));
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/socketServer.integration.test.ts`
Then: `pnpm --filter @vobo/server typecheck`
Expected: all PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/types.ts apps/server/src/socketServer.ts apps/server/src/socketServer.integration.test.ts
git commit -m "feat(server): snapshot turnMs/rolling and per-room turn timer"
```

---

## Task 6: Server — previous winner goes first

**Files:**
- Modify: `apps/server/src/roomManager.ts`
- Modify: `apps/server/src/socketServer.ts`
- Test: `apps/server/src/roomManager.firstplayer.test.ts`

- [ ] **Step 1: Write the failing test** — `roomManager.firstplayer.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

describe('RoomManager.startGame first player', () => {
  it('puts the recorded previous winner first', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, DEFAULT_CONFIG);
    const a = m.createRoom('An');
    const b = m.joinRoom(a.code, 'Bình') as { ok: true; playerId: string };
    store.get(a.code)!.lastWinnerId = b.playerId; // pretend Bình won last game
    m.startGame(a.code, a.playerId);
    expect(store.get(a.code)!.state!.turnOrder[0]).toBe(b.playerId);
  });

  it('resets the reveal flags on start', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, DEFAULT_CONFIG);
    const a = m.createRoom('An');
    m.joinRoom(a.code, 'Bình');
    const room = store.get(a.code)!;
    room.rolling = true;
    room.revealDone = true;
    m.startGame(a.code, a.playerId);
    expect(room.rolling).toBe(false);
    expect(room.revealDone).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.firstplayer.test.ts`
Expected: FAIL — `startGame` neither passes `firstPlayerId` nor resets the flags.

- [ ] **Step 3a: Edit `startGame`** — in `roomManager.ts`, replace the body's tail:
```ts
    room.state = bingoModule.createInitialState(room.roster, room.rng);
    return { ok: true };
```
with:
```ts
    room.rolling = false;
    room.revealDone = false;
    room.state = bingoModule.createInitialState(room.roster, room.rng, {
      firstPlayerId: room.lastWinnerId,
    });
    return { ok: true };
```

- [ ] **Step 3b: Record the winner on finish** — in `socketServer.ts`, in `orchestrate`, the `finished` branch currently starts with `room.turnStartedAt = undefined;`. Add the winner capture as its first line:
```ts
    if (room.state.phase === 'finished') {
      room.lastWinnerId = room.state.winners[0];
      room.turnStartedAt = undefined;
      room.turnEndsAt = undefined;
      broadcast(code);
      io.to(code).emit('game:finished', { winnerId: room.state.winners[0]! });
      return;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.firstplayer.test.ts`
Then: `pnpm --filter @vobo/server typecheck` and the full suite `pnpm --filter @vobo/server test`
Expected: all PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/roomManager.ts apps/server/src/socketServer.ts apps/server/src/roomManager.firstplayer.test.ts
git commit -m "feat(server): previous winner goes first (startGame firstPlayerId + record winner)"
```

---

## Task 7: Server — fair "rolling" dice-reveal at game start

**Files:**
- Modify: `apps/server/src/socketServer.ts`
- Test: `apps/server/src/socketServer.integration.test.ts`

Adds a short server-timed reveal window at the start of each game: `rolling: true`, no turn deadline, calls rejected; then the first turn starts.

- [ ] **Step 1: Add the failing test** — append INSIDE the existing `describe('socket server (end-to-end)', ...)` block. This test uses its own server with a tiny `revealMs`:

```ts
  it('runs a short rolling reveal before the first turn, blocking calls', async () => {
    const srv = await startTestServer({ maxPlayers: 6, minPlayers: 2, turnMs: 60_000, botDelayMs: 5, revealMs: 120 });
    try {
      const a = ioClient(`http://localhost:${srv.port}`);
      const b = ioClient(`http://localhost:${srv.port}`);
      clients.push(a, b);

      const created = await emit<{ ok: true; code: string; playerId: string }>(a, 'room:create', { name: 'An' });
      await emit(b, 'room:join', { code: created.code, name: 'Bình' });
      await emit(a, 'room:start');
      await emit(a, 'player:fillCard', { card: ordered });
      await emit(a, 'player:ready');
      await emit(b, 'player:fillCard', { card: ordered });

      // Capture the first playing snapshot: it should be rolling with no deadline.
      const rollingSnap = await new Promise<RoomSnapshot>((resolve) => {
        a.on('room:state', (s: RoomSnapshot) => { if (s.status === 'playing' && s.rolling) resolve(s); });
        void emit(b, 'player:ready');
      });
      expect(rollingSnap.rolling).toBe(true);
      expect(rollingSnap.turnEndsAt).toBeNull();

      // A call during rolling is rejected.
      const rejected = await emit<{ ok: boolean; code?: string }>(a, 'game:call', { n: 1 });
      expect(rejected.ok).toBe(false);

      // After the reveal window, the turn starts (rolling false, deadline set).
      const playingSnap = await new Promise<RoomSnapshot>((resolve) => {
        a.on('room:state', (s: RoomSnapshot) => { if (s.status === 'playing' && !s.rolling && s.turnEndsAt) resolve(s); });
      });
      expect(playingSnap.rolling).toBe(false);
      expect(typeof playingSnap.turnEndsAt).toBe('number');
    } finally {
      await srv.close();
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/socketServer.integration.test.ts`
Expected: FAIL — there is no rolling phase (first snapshot already has a deadline; the call is accepted).

- [ ] **Step 3a: Add the rolling phase to `orchestrate`** — in `socketServer.ts`, in `orchestrate`, replace the block that currently starts the turn (from `const cur = manager.currentPlayer(room);` down to the end of the function) with:

```ts
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
      broadcast(code);
      return;
    }

    const cur = manager.currentPlayer(room);
    if (!cur) {
      broadcast(code);
      return;
    }
    const now = Date.now();
    room.turnStartedAt = now;
    room.turnEndsAt = now + (cur.isBot ? cfg.botDelayMs : room.turnMs);
    broadcast(code);
    if (cur.isBot) {
      turnTimers.set(code, setTimeout(() => { manager.botCall(code); orchestrate(code); }, cfg.botDelayMs));
    } else {
      turnTimers.set(code, setTimeout(() => { manager.autoCall(code); orchestrate(code); }, room.turnMs));
    }
```

- [ ] **Step 3b: Block calls during rolling** — in `socketServer.ts`, change the `game:call` handler:
```ts
    socket.on('game:call', ({ n }, ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const r = manager.callNumber(c.code, c.playerId, n);
      ack(r.ok ? { ok: true } : r);
      if (r.ok) orchestrate(c.code);
    });
```
to:
```ts
    socket.on('game:call', ({ n }, ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      if (store.get(c.code)?.rolling) return ack({ ok: false, code: 'rolling', message: 'Đang chọn lượt đi đầu' });
      const r = manager.callNumber(c.code, c.playerId, n);
      ack(r.ok ? { ok: true } : r);
      if (r.ok) orchestrate(c.code);
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/socketServer.integration.test.ts`
Then the FULL server suite: `pnpm --filter @vobo/server test`
Then typecheck: `pnpm --filter @vobo/server typecheck`
Expected: all PASS. The pre-existing integration tests already set `revealMs: 20` on their server configs (done in Task 3), so their `room:state` polling loops simply pass through a ~20ms reveal — no waiting, no assertion changes needed. Typecheck clean.

> If any pre-existing test still races (e.g. it grabbed the very first `playing` snapshot, which is now the rolling one), make its `s.status === 'playing'` waiter also require `!s.rolling` (as the turn-deadline test in Task 5 already does) rather than weakening assertions.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/socketServer.ts apps/server/src/socketServer.integration.test.ts
git commit -m "feat(server): fair rolling dice-reveal at game start; block calls while rolling"
```

---

## Self-Review

**Spec coverage:**
- Engine `createInitialState(opts.firstPlayerId)` + shuffled turnOrder → Task 1 ✅
- `setReady` stops seeding turnOrder → Task 2 ✅
- Config presets + `revealMs` → Task 3 ✅
- `Room.turnMs/lastWinnerId/rolling/revealDone`, `CreatePayload.turnMs` → Task 3 ✅
- `createRoom(name, turnMs)` validation → Task 4 ✅
- `RoomSnapshot.turnMs/rolling` + `snapshotFor` + per-room turn timer → Task 5 ✅
- `startGame` passes `firstPlayerId`; `lastWinnerId` recorded on finish; reset flags → Task 6 ✅
- Rolling reveal window (server-timed, no deadline, calls blocked) → Task 7 ✅

**Placeholder scan:** none. Every modify step shows the exact before/after code.

**Type consistency:** `createInitialState(players, rng, opts?)` matches across engine interface (Task 1), impl (Task 1), and `bingoModule` (passed by reference, unchanged). `Room.turnMs` is required (Task 3) and set in `createRoom` (Tasks 3/4) + the RoomStore test fixture (Task 3). `RoomSnapshot.turnMs/rolling` (Task 5) are produced by `snapshotFor` (Task 5). `room.revealMs` is read via `cfg.revealMs` (config, Task 3) in `orchestrate` (Task 7). `firstPlayerId`/`lastWinnerId` string ids line up.

Note: the web side (turn-time selector, gray-track pill timer, rolling reveal overlay) is a **separate plan** (`2026-07-14-vobo-ux-v3-web.md`), written after this back-end exists so it references the real `turnMs`/`rolling` snapshot fields.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-14-vobo-ux-v3-engine-server.md`. This is the **engine + server plan** (1 of 2 for v3); the web plan follows.

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.

**2. Inline Execution** — execute in this session with checkpoints.

Which approach?
