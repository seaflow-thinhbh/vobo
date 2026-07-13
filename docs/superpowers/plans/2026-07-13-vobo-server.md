# Vobo Realtime Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/server` — an authoritative Node + Socket.IO server that hosts Bingo rooms in memory, validates every move through `@vobo/game-engine`, and broadcasts per-player views.

**Architecture:** A pure-ish `RoomManager` owns all room state (via a `RoomStore`) and mutates it by delegating game rules to `bingoModule` (the server never re-implements rules). A thin `socketServer` layer wires Socket.IO events to `RoomManager` and drives time-based behavior (turn timeouts, bot turns). RoomManager methods are synchronous and unit-testable without sockets; the socket layer gets one real end-to-end integration test.

**Tech Stack:** TypeScript (strict), Node, Socket.IO (+ socket.io-client for tests), Vitest. Consumes `@vobo/game-engine` (workspace dependency).

**Scope note — this is Plan 2 of 3 (engine ✅ → server → web).** Deliberate YAGNI deferrals for this first server cut (documented in §"Deferred"): (1) no separate "disconnect → 20s → smart-bot takeover" timer — a disconnected or idle player's turns are covered by the **turn-timeout auto-call** (a random legal call every `turnMs`), which satisfies the spec's "keep the game moving" intent; on `resume` they reclaim their seat and play manually again. (2) No idle-room reaper timer; rooms are deleted when the last human seat leaves. Both are easy to add later without touching game logic.

---

## Engine API this plan consumes (already built, do not modify)

From `@vobo/game-engine` (`packages/game-engine/src/index.ts`):
- `bingoModule: GameModule<BingoState, BingoMove, BingoView>` with methods:
  - `createInitialState(players: PlayerSeat[], rng: Rng): BingoState`
  - `validateMove(state, playerId, move): Result` where `Result = {ok:true} | {ok:false; code; message}`
  - `applyMove(state, playerId, move): BingoState`
  - `checkGameEnd(state): { finished: boolean; winners: string[] }`
  - `botMove(view: BingoView, difficulty, rng: Rng): BingoMove`
  - `projectStateFor(state, playerId): BingoView`
- `createRng(seed: number): Rng`
- Types: `PlayerSeat {id,name,isBot,botDifficulty?}`, `BingoState`, `BingoPlayer`, `BingoMove` (`{type:'FillCard';card} | {type:'SetReady'} | {type:'CallNumber';n}`), `BingoView`, `GamePhase = 'setup'|'playing'|'finished'`, `Difficulty`, `Rng`.

Engine phases are only `setup|playing|finished`. The **lobby** (players joining, host adding bots, before `createInitialState`) is a server concept: a room with `state === undefined`.

---

## File Structure

```
apps/server/
├─ package.json
├─ tsconfig.json
├─ vitest.config.ts
└─ src/
   ├─ config.ts          # RoomConfig + DEFAULT_CONFIG (maxPlayers, turnMs, botDelayMs, ...)
   ├─ types.ts           # Room, Seat, OpResult, RoomSnapshot, socket payload/event maps
   ├─ ids.ts             # generatePlayerId, generateToken
   ├─ roomStore.ts       # RoomStore interface + InMemoryRoomStore
   ├─ roomCode.ts        # generateRoomCode (6 chars, no ambiguous letters)
   ├─ roomManager.ts     # RoomManager: all room mutations, delegates rules to bingoModule
   ├─ socketServer.ts    # attachSocketServer(io, manager, store, cfg): events + broadcast + timers
   └─ index.ts           # boot http + Socket.IO, listen
```

`RoomManager` is the one larger file (it owns coordination). Pure sub-concerns (ids, codes, store, config, types) are split out. Tests are colocated `*.test.ts`.

---

## Task 1: Scaffold apps/server package

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/vitest.config.ts`
- Test: `apps/server/src/smoke.test.ts`

- [ ] **Step 1: Create `apps/server/package.json`**

```json
{
  "name": "@vobo/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@vobo/game-engine": "workspace:*",
    "socket.io": "^4.8.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "socket.io-client": "^4.8.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `apps/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "noEmit": true,
    "types": ["node"],
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `apps/server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 10000,
  },
});
```

- [ ] **Step 4: Write the smoke test** — `apps/server/src/smoke.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { bingoModule } from '@vobo/game-engine';

describe('smoke', () => {
  it('can import the game engine', () => {
    expect(bingoModule.id).toBe('bingo');
  });
});
```

- [ ] **Step 5: Install and run**

Run: `pnpm install`
Then: `pnpm --filter @vobo/server test`
Expected: 1 passing test (confirms the workspace dependency on `@vobo/game-engine` resolves).

- [ ] **Step 6: Commit**

```bash
git add apps/server pnpm-lock.yaml
git commit -m "chore: scaffold @vobo/server package"
```

---

## Task 2: Config and shared types

**Files:**
- Create: `apps/server/src/config.ts`
- Create: `apps/server/src/types.ts`

Types-only + constants. Verified by typecheck.

- [ ] **Step 1: Create `src/config.ts`**

```ts
export interface RoomConfig {
  maxPlayers: number;
  minPlayers: number;
  turnMs: number; // per-turn timeout; auto-calls a random number when it expires
  botDelayMs: number; // delay before a bot plays its turn (feels human)
}

export const DEFAULT_CONFIG: RoomConfig = {
  maxPlayers: 6,
  minPlayers: 2,
  turnMs: 20_000,
  botDelayMs: 1_200,
};
```

- [ ] **Step 2: Create `src/types.ts`**

```ts
import type { BingoState, BingoView, PlayerSeat, Rng, Difficulty } from '@vobo/game-engine';

export interface Seat {
  token: string;
  socketId?: string; // present while connected
}

export interface Room {
  code: string;
  hostId: string;
  gameId: 'bingo';
  roster: PlayerSeat[]; // lobby roster; frozen into `state` when the game starts
  state?: BingoState; // engine state, created on start
  seats: Map<string, Seat>; // playerId -> auth/connection (HUMANS only; bots have no seat)
  rng: Rng; // engine RNG (card generation)
  botRng: Rng; // bot decision RNG
}

export type RoomStatus = 'lobby' | 'setup' | 'playing' | 'finished';

/** Discriminated result for RoomManager operations. */
export type OpResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message: string };

export interface RosterEntry {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
}

/** Per-player snapshot pushed to a client after any change. */
export interface RoomSnapshot {
  code: string;
  status: RoomStatus;
  hostId: string;
  youId: string;
  roster: RosterEntry[];
  view: BingoView | null; // null during lobby; player-specific once started
}

// ---- Socket payloads & acks ----
export type Ack<T> = T | { ok: false; code: string; message: string };

export interface CreatePayload { name: string; }
export interface JoinPayload { code: string; name: string; }
export interface ResumePayload { code: string; token: string; }
export interface AddBotPayload { difficulty: Difficulty; }
export interface FillCardPayload { card: number[]; }
export interface CallPayload { n: number; }

export interface CreateAck { ok: true; code: string; playerId: string; token: string; }
export interface JoinAck { ok: true; playerId: string; token: string; }
export interface ResumeAck { ok: true; playerId: string; }
export interface OkAck { ok: true; }

export interface ClientToServerEvents {
  'room:create': (p: CreatePayload, ack: (r: Ack<CreateAck>) => void) => void;
  'room:join': (p: JoinPayload, ack: (r: Ack<JoinAck>) => void) => void;
  'room:resume': (p: ResumePayload, ack: (r: Ack<ResumeAck>) => void) => void;
  'room:addBot': (p: AddBotPayload, ack: (r: Ack<OkAck>) => void) => void;
  'player:fillCard': (p: FillCardPayload, ack: (r: Ack<OkAck>) => void) => void;
  'player:ready': (ack: (r: Ack<OkAck>) => void) => void;
  'room:start': (ack: (r: Ack<OkAck>) => void) => void;
  'game:call': (p: CallPayload, ack: (r: Ack<OkAck>) => void) => void;
  'room:leave': (ack: (r: Ack<OkAck>) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (snapshot: RoomSnapshot) => void;
  'game:finished': (p: { winnerId: string }) => void;
  'error': (p: { code: string; message: string }) => void;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @vobo/server typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/config.ts apps/server/src/types.ts
git commit -m "feat(server): add config and shared types"
```

---

## Task 3: ID and token generation

**Files:**
- Create: `apps/server/src/ids.ts`
- Test: `apps/server/src/ids.test.ts`

- [ ] **Step 1: Write the failing test** — `src/ids.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { generatePlayerId, generateToken } from './ids';

describe('ids', () => {
  it('player ids are unique and prefixed', () => {
    const a = generatePlayerId();
    const b = generatePlayerId();
    expect(a).not.toBe(b);
    expect(a.startsWith('p_')).toBe(true);
  });

  it('tokens are long random hex strings, unique per call', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/ids.test.ts`
Expected: FAIL — cannot find module `./ids`.

- [ ] **Step 3: Implement `src/ids.ts`**

```ts
import { randomBytes } from 'node:crypto';

export function generatePlayerId(): string {
  return 'p_' + randomBytes(6).toString('hex');
}

export function generateToken(): string {
  return randomBytes(16).toString('hex');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/ids.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ids.ts apps/server/src/ids.test.ts
git commit -m "feat(server): add id and token generation"
```

---

## Task 4: RoomStore

**Files:**
- Create: `apps/server/src/roomStore.ts`
- Test: `apps/server/src/roomStore.test.ts`

- [ ] **Step 1: Write the failing test** — `src/roomStore.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { InMemoryRoomStore } from './roomStore';
import type { Room } from './types';
import { createRng } from '@vobo/game-engine';

function makeRoom(code: string): Room {
  return {
    code,
    hostId: 'p1',
    gameId: 'bingo',
    roster: [],
    seats: new Map(),
    rng: createRng(1),
    botRng: createRng(2),
  };
}

describe('InMemoryRoomStore', () => {
  it('creates, gets, and reports existence', () => {
    const store = new InMemoryRoomStore();
    expect(store.has('ABC')).toBe(false);
    store.create(makeRoom('ABC'));
    expect(store.has('ABC')).toBe(true);
    expect(store.get('ABC')?.code).toBe('ABC');
  });

  it('deletes rooms', () => {
    const store = new InMemoryRoomStore();
    store.create(makeRoom('XYZ'));
    store.delete('XYZ');
    expect(store.get('XYZ')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/roomStore.test.ts`
Expected: FAIL — cannot find module `./roomStore`.

- [ ] **Step 3: Implement `src/roomStore.ts`**

```ts
import type { Room } from './types';

/** Storage boundary for rooms. Swap for a Redis-backed impl later without touching game logic. */
export interface RoomStore {
  create(room: Room): void;
  get(code: string): Room | undefined;
  has(code: string): boolean;
  delete(code: string): void;
}

export class InMemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Room>();

  create(room: Room): void {
    this.rooms.set(room.code, room);
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  has(code: string): boolean {
    return this.rooms.has(code);
  }

  delete(code: string): void {
    this.rooms.delete(code);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/roomStore.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/roomStore.ts apps/server/src/roomStore.test.ts
git commit -m "feat(server): add in-memory room store"
```

---

## Task 5: Room code generator

**Files:**
- Create: `apps/server/src/roomCode.ts`
- Test: `apps/server/src/roomCode.test.ts`

- [ ] **Step 1: Write the failing test** — `src/roomCode.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { generateRoomCode, ROOM_CODE_ALPHABET } from './roomCode';

describe('generateRoomCode', () => {
  it('produces a 6-char code from the safe alphabet', () => {
    const code = generateRoomCode(Math.random, () => false);
    expect(code).toHaveLength(6);
    for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
  });

  it('excludes ambiguous characters 0 O 1 I L', () => {
    for (const ch of '0O1IL') expect(ROOM_CODE_ALPHABET).not.toContain(ch);
  });

  it('retries until it finds an untaken code', () => {
    let calls = 0;
    // First generated code is "taken" once, then free.
    const isTaken = () => calls++ < 1;
    const code = generateRoomCode(Math.random, isTaken);
    expect(code).toHaveLength(6);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/roomCode.test.ts`
Expected: FAIL — cannot find module `./roomCode`.

- [ ] **Step 3: Implement `src/roomCode.ts`**

```ts
/** Uppercase letters/digits minus ambiguous ones (0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode(rand: () => number, isTaken: (code: string) => boolean): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(rand() * ROOM_CODE_ALPHABET.length)];
    }
    if (!isTaken(code)) return code;
  }
  throw new Error('unable to generate a unique room code');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/roomCode.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/roomCode.ts apps/server/src/roomCode.test.ts
git commit -m "feat(server): add room code generator"
```

---

## Task 6: RoomManager — createRoom and joinRoom

**Files:**
- Create: `apps/server/src/roomManager.ts`
- Test: `apps/server/src/roomManager.lobby.test.ts`

- [ ] **Step 1: Write the failing test** — `src/roomManager.lobby.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

function makeManager() {
  return new RoomManager(new InMemoryRoomStore(), DEFAULT_CONFIG);
}

describe('RoomManager create/join', () => {
  it('createRoom returns code/playerId/token and seats the host', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, DEFAULT_CONFIG);
    const { code, playerId } = m.createRoom('An');
    const room = store.get(code)!;
    expect(room.hostId).toBe(playerId);
    expect(room.roster.map((p) => p.name)).toEqual(['An']);
    expect(room.seats.has(playerId)).toBe(true);
    expect(room.state).toBeUndefined(); // lobby
  });

  it('joinRoom adds a second player', () => {
    const m = makeManager();
    const { code } = m.createRoom('An');
    const r = m.joinRoom(code, 'Bình');
    expect(r.ok).toBe(true);
  });

  it('rejects joining a missing room', () => {
    const m = makeManager();
    const r = m.joinRoom('NOPE00', 'X');
    expect(r).toMatchObject({ ok: false, code: 'no_room' });
  });

  it('rejects joining a full room', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, { ...DEFAULT_CONFIG, maxPlayers: 2 });
    const { code } = m.createRoom('An');
    m.joinRoom(code, 'Bình');
    const r = m.joinRoom(code, 'Ba');
    expect(r).toMatchObject({ ok: false, code: 'room_full' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.lobby.test.ts`
Expected: FAIL — cannot find module `./roomManager`.

- [ ] **Step 3: Implement `src/roomManager.ts`** (initial version — create/join + helpers)

```ts
import { bingoModule, createRng } from '@vobo/game-engine';
import type { BingoMove, BingoPlayer, Difficulty } from '@vobo/game-engine';
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.lobby.test.ts`
Then typecheck: `pnpm --filter @vobo/server typecheck`
Expected: PASS (4 tests), typecheck clean. (Unused imports `BingoMove`, `BingoPlayer`, `Difficulty`, `bingoModule` are added now because later tasks use them; if the typecheck flags them as unused, they are used in Tasks 7–9 — leave them only if typecheck passes, otherwise remove and re-add per task. With the base tsconfig they are NOT flagged as errors.)

> Note: if `noUnusedLocals` were on this would fail; the base tsconfig does not set it, so the imports are allowed. To be safe, this task only imports what it uses: replace the import lines with `import { createRng } from '@vobo/game-engine';` and add the others in their tasks.

Apply that safety note now — the top of `roomManager.ts` for THIS task should be exactly:

```ts
import { createRng } from '@vobo/game-engine';
import type { RoomConfig } from './config';
import type { OpResult, Room } from './types';
import type { RoomStore } from './roomStore';
import { generateRoomCode } from './roomCode';
import { generatePlayerId, generateToken } from './ids';
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/roomManager.ts apps/server/src/roomManager.lobby.test.ts
git commit -m "feat(server): RoomManager create and join"
```

---

## Task 7: RoomManager — addBot and startGame

**Files:**
- Modify: `apps/server/src/roomManager.ts`
- Test: `apps/server/src/roomManager.start.test.ts`

- [ ] **Step 1: Write the failing test** — `src/roomManager.start.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

function setup(cfg = DEFAULT_CONFIG) {
  const store = new InMemoryRoomStore();
  const m = new RoomManager(store, cfg);
  const { code, playerId } = m.createRoom('An');
  return { store, m, code, hostId: playerId };
}

describe('RoomManager addBot/startGame', () => {
  it('host can add a bot with a difficulty', () => {
    const { store, m, code, hostId } = setup();
    const r = m.addBot(code, hostId, 'hard');
    expect(r.ok).toBe(true);
    const room = store.get(code)!;
    const bot = room.roster.find((p) => p.isBot)!;
    expect(bot.botDifficulty).toBe('hard');
  });

  it('non-host cannot add a bot', () => {
    const { m, code } = setup();
    expect(m.addBot(code, 'someone-else', 'easy')).toMatchObject({ ok: false, code: 'not_host' });
  });

  it('startGame requires the minimum number of players', () => {
    const { m, code, hostId } = setup();
    expect(m.startGame(code, hostId)).toMatchObject({ ok: false, code: 'not_enough_players' });
  });

  it('startGame creates engine state in setup phase once minimum is met', () => {
    const { store, m, code, hostId } = setup();
    m.addBot(code, hostId, 'medium');
    const r = m.startGame(code, hostId);
    expect(r.ok).toBe(true);
    const room = store.get(code)!;
    expect(room.state?.phase).toBe('setup');
    // bot is auto-ready with a card; host (human) is not
    const bot = room.state!.players.find((p) => p.isBot)!;
    expect(bot.ready).toBe(true);
    expect(room.state!.players.find((p) => p.id === hostId)!.ready).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.start.test.ts`
Expected: FAIL — `m.addBot`/`m.startGame` are not functions.

- [ ] **Step 3: Modify `src/roomManager.ts`**

Add `bingoModule` and `Difficulty` to the imports. Change the import block to:

```ts
import { bingoModule, createRng } from '@vobo/game-engine';
import type { Difficulty } from '@vobo/game-engine';
import type { RoomConfig } from './config';
import type { OpResult, Room } from './types';
import type { RoomStore } from './roomStore';
import { generateRoomCode } from './roomCode';
import { generatePlayerId, generateToken } from './ids';
```

Add these methods to the `RoomManager` class (after `joinRoom`):

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.start.test.ts`
Then re-run the lobby test (no regression): `pnpm --filter @vobo/server exec vitest run src/roomManager.lobby.test.ts`
Then typecheck: `pnpm --filter @vobo/server typecheck`
Expected: all PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/roomManager.ts apps/server/src/roomManager.start.test.ts
git commit -m "feat(server): RoomManager addBot and startGame"
```

---

## Task 8: RoomManager — game moves (fillCard, setReady, callNumber)

**Files:**
- Modify: `apps/server/src/roomManager.ts`
- Test: `apps/server/src/roomManager.moves.test.ts`

- [ ] **Step 1: Write the failing test** — `src/roomManager.moves.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

// Two humans, game started (setup phase).
function twoHumanGame() {
  const store = new InMemoryRoomStore();
  const m = new RoomManager(store, DEFAULT_CONFIG);
  const { code, playerId: a } = m.createRoom('An');
  const b = (m.joinRoom(code, 'Bình') as { ok: true; playerId: string }).playerId;
  m.startGame(code, a);
  return { store, m, code, a, b };
}

describe('RoomManager game moves', () => {
  it('rejects an invalid card', () => {
    const { m, code, a } = twoHumanGame();
    expect(m.fillCard(code, a, [1, 2, 3])).toMatchObject({ ok: false });
  });

  it('fill + ready for both players transitions the game to playing', () => {
    const { store, m, code, a, b } = twoHumanGame();
    expect(m.fillCard(code, a, ordered).ok).toBe(true);
    expect(m.setReady(code, a).ok).toBe(true);
    expect(m.fillCard(code, b, ordered).ok).toBe(true);
    expect(m.setReady(code, b).ok).toBe(true);
    expect(store.get(code)!.state!.phase).toBe('playing');
  });

  it('rejects calling out of turn', () => {
    const { m, code, a, b } = twoHumanGame();
    m.fillCard(code, a, ordered); m.setReady(code, a);
    m.fillCard(code, b, ordered); m.setReady(code, b);
    // turnOrder starts with a; b calling should be rejected
    expect(m.callNumber(code, b, 7)).toMatchObject({ ok: false, code: 'not_your_turn' });
    expect(m.callNumber(code, a, 7).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.moves.test.ts`
Expected: FAIL — `m.fillCard` is not a function.

- [ ] **Step 3: Modify `src/roomManager.ts`** — add move methods + a shared helper

Add to the `RoomManager` class:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.moves.test.ts`
Then typecheck: `pnpm --filter @vobo/server typecheck`
Expected: PASS (3 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/roomManager.ts apps/server/src/roomManager.moves.test.ts
git commit -m "feat(server): RoomManager fillCard/setReady/callNumber via engine"
```

---

## Task 9: RoomManager — automated turns (currentPlayer, botCall, autoCall)

**Files:**
- Modify: `apps/server/src/roomManager.ts`
- Test: `apps/server/src/roomManager.auto.test.ts`

- [ ] **Step 1: Write the failing test** — `src/roomManager.auto.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

// Human 'a' + one bot, driven to the playing phase.
function humanVsBot() {
  const store = new InMemoryRoomStore();
  // deterministic rand so autoCall is reproducible
  let seed = 0.1;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280 / 233280);
  const m = new RoomManager(store, DEFAULT_CONFIG, rand);
  const { code, playerId: a } = m.createRoom('An');
  m.addBot(code, a, 'medium');
  m.startGame(code, a);
  m.fillCard(code, a, ordered);
  m.setReady(code, a); // bot already ready -> transitions to playing
  return { store, m, code, a };
}

describe('RoomManager automated turns', () => {
  it('currentPlayer reports whose turn it is in the playing phase', () => {
    const { store, m, code, a } = humanVsBot();
    const room = store.get(code)!;
    expect(m.currentPlayer(room)!.id).toBe(a); // 'a' seated first
  });

  it('autoCall appends a legal number and advances the turn', () => {
    const { store, m, code } = humanVsBot();
    const before = store.get(code)!.state!.calledNumbers.length;
    const r = m.autoCall(code);
    expect(r.ok).toBe(true);
    const state = store.get(code)!.state!;
    expect(state.calledNumbers.length).toBe(before + 1);
  });

  it('botCall makes a move when it is the bot turn', () => {
    const { store, m, code } = humanVsBot();
    m.autoCall(code); // advance past human 'a' -> now bot's turn
    const before = store.get(code)!.state!.calledNumbers.length;
    const r = m.botCall(code);
    expect(r.ok).toBe(true);
    expect(store.get(code)!.state!.calledNumbers.length).toBe(before + 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.auto.test.ts`
Expected: FAIL — `m.currentPlayer` is not a function.

- [ ] **Step 3: Modify `src/roomManager.ts`** — add automated-turn methods and a module-level helper

Add `BingoPlayer` to the type import: change `import type { Difficulty } from '@vobo/game-engine';` to `import type { Difficulty, BingoPlayer } from '@vobo/game-engine';`.

Add to the `RoomManager` class:

```ts
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
    const n = uncalled[Math.floor(this.rand() * uncalled.length)]!;
    room.state = bingoModule.applyMove(room.state, cur.id, { type: 'CallNumber', n });
    return { ok: true };
  }
```

Add this module-level helper at the bottom of the file (after the class):

```ts
function uncalledNumbers(called: number[]): number[] {
  const set = new Set(called);
  const out: number[] = [];
  for (let n = 1; n <= 25; n++) if (!set.has(n)) out.push(n);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.auto.test.ts`
Then typecheck: `pnpm --filter @vobo/server typecheck`
Expected: PASS (3 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/roomManager.ts apps/server/src/roomManager.auto.test.ts
git commit -m "feat(server): RoomManager automated turns (bot + timeout auto-call)"
```

---

## Task 10: RoomManager — leave, resume, connection tracking

**Files:**
- Modify: `apps/server/src/roomManager.ts`
- Test: `apps/server/src/roomManager.conn.test.ts`

- [ ] **Step 1: Write the failing test** — `src/roomManager.conn.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

function lobbyWithTwo() {
  const store = new InMemoryRoomStore();
  const m = new RoomManager(store, DEFAULT_CONFIG);
  const { code, playerId: a, token: ta } = m.createRoom('An');
  const j = m.joinRoom(code, 'Bình') as { ok: true; playerId: string; token: string };
  return { store, m, code, a, ta, b: j.playerId, tb: j.token };
}

describe('RoomManager leave/resume/connection', () => {
  it('leaving the lobby removes the player from the roster', () => {
    const { store, m, code, b } = lobbyWithTwo();
    const r = m.leave(code, b);
    expect(r).toMatchObject({ ok: true, roomDeleted: false });
    expect(store.get(code)!.roster.find((p) => p.id === b)).toBeUndefined();
  });

  it('host leaving transfers host to a remaining human', () => {
    const { store, m, code, a, b } = lobbyWithTwo();
    m.leave(code, a);
    expect(store.get(code)!.hostId).toBe(b);
  });

  it('deletes the room when the last human leaves', () => {
    const { store, m, code, a, b } = lobbyWithTwo();
    m.leave(code, a);
    const r = m.leave(code, b);
    expect(r).toMatchObject({ ok: true, roomDeleted: true });
    expect(store.get(code)).toBeUndefined();
  });

  it('resume matches a seat by token', () => {
    const { m, code, a, ta } = lobbyWithTwo();
    expect(m.resume(code, ta)).toMatchObject({ ok: true, playerId: a });
    expect(m.resume(code, 'wrong-token')).toMatchObject({ ok: false, code: 'bad_token' });
  });

  it('attachSocket / markDisconnected track the socket id', () => {
    const { store, m, code, a } = lobbyWithTwo();
    m.attachSocket(code, a, 'sock-1');
    expect(store.get(code)!.seats.get(a)!.socketId).toBe('sock-1');
    m.markDisconnected(code, a);
    expect(store.get(code)!.seats.get(a)!.socketId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.conn.test.ts`
Expected: FAIL — `m.leave` is not a function.

- [ ] **Step 3: Modify `src/roomManager.ts`** — add these methods to the class

```ts
  attachSocket(code: string, playerId: string, socketId: string): void {
    const seat = this.store.get(code)?.seats.get(playerId);
    if (seat) seat.socketId = socketId;
  }

  markDisconnected(code: string, playerId: string): void {
    const seat = this.store.get(code)?.seats.get(playerId);
    if (seat) seat.socketId = undefined;
  }

  resume(code: string, token: string): OpResult<{ playerId: string }> {
    const room = this.store.get(code);
    if (!room) return fail('no_room', 'Không tìm thấy phòng');
    for (const [playerId, seat] of room.seats) {
      if (seat.token === token) return { ok: true, playerId };
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
      // in-game: convert the seat to a bot so the game keeps going
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/roomManager.conn.test.ts`
Then run ALL roomManager tests: `pnpm --filter @vobo/server exec vitest run src/roomManager.*.test.ts`
Then typecheck: `pnpm --filter @vobo/server typecheck`
Expected: all PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/roomManager.ts apps/server/src/roomManager.conn.test.ts
git commit -m "feat(server): RoomManager leave/resume/connection tracking"
```

---

## Task 11: Socket server wiring (events + broadcast + timers)

**Files:**
- Create: `apps/server/src/socketServer.ts`

No test in this task (it is exercised by the end-to-end test in Task 12). Verified by typecheck.

- [ ] **Step 1: Create `src/socketServer.ts`**

```ts
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
    return {
      code: room.code,
      status: room.state ? room.state.phase : 'lobby',
      hostId: room.hostId,
      youId: playerId,
      roster,
      view: room.state ? bingoModule.projectStateFor(room.state, playerId) : null,
    };
  }

  function broadcast(code: string): void {
    const room = store.get(code);
    if (!room) return;
    for (const [playerId, seat] of room.seats) {
      if (seat.socketId) io.to(seat.socketId).emit('room:state', snapshotFor(room, playerId));
    }
  }

  /** Broadcast, then drive automated turns (bot moves / turn timeouts) and end-of-game. */
  function orchestrate(code: string): void {
    broadcast(code);
    clearTurnTimer(code);
    const room = store.get(code);
    if (!room || !room.state) return;

    if (room.state.phase === 'finished') {
      io.to(code).emit('game:finished', { winnerId: room.state.winners[0]! });
      return;
    }
    if (room.state.phase !== 'playing') return;

    const cur = manager.currentPlayer(room);
    if (!cur) return;
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
      conn.code = undefined;
      conn.playerId = undefined;
    });

    socket.on('disconnect', () => {
      const c = requireConn();
      if (!c) return;
      manager.markDisconnected(c.code, c.playerId);
      broadcast(c.code);
      // Turn timeouts continue to auto-call for a disconnected player's turns;
      // on resume they reclaim the seat. (No separate takeover timer — see plan §Deferred.)
    });
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @vobo/server typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/socketServer.ts
git commit -m "feat(server): Socket.IO wiring, broadcasting, turn orchestration"
```

---

## Task 12: End-to-end Socket.IO integration test

**Files:**
- Create: `apps/server/src/socketServer.integration.test.ts`

Spin up a real Socket.IO server + real clients, play a full game over the wire.

- [ ] **Step 1: Write the failing test** — `src/socketServer.integration.test.ts`

```ts
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
      if (s.status === 'finished') break;
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
```

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `pnpm --filter @vobo/server exec vitest run src/socketServer.integration.test.ts`
Expected initially: may FAIL if `socketServer.ts` has any wiring bug. Fix wiring in `socketServer.ts` until all 3 tests pass. Do NOT weaken the assertions. (If a test is flaky due to timing, increase the per-iteration `delay` or the final race timeout — but the game must genuinely finish.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @vobo/server typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/socketServer.integration.test.ts
git commit -m "test(server): end-to-end Socket.IO game integration tests"
```

---

## Task 13: Server entry point

**Files:**
- Create: `apps/server/src/index.ts`
- Test: `apps/server/src/index.test.ts`

- [ ] **Step 1: Write the failing test** — `src/index.test.ts`

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { startServer } from './index';

let stop: (() => Promise<void>) | undefined;
const clients: Socket[] = [];

afterEach(async () => {
  for (const c of clients) c.close();
  clients.length = 0;
  if (stop) await stop();
  stop = undefined;
});

describe('startServer', () => {
  it('boots and accepts a connection that can create a room', async () => {
    const started = await startServer(0);
    stop = started.stop;

    const c = ioClient(`http://localhost:${started.port}`);
    clients.push(c);

    const created = await new Promise<{ ok: boolean; code?: string }>((resolve) => {
      c.emit('room:create', { name: 'An' }, resolve);
    });
    expect(created.ok).toBe(true);
    expect(created.code).toMatch(/^[A-Z0-9]{6}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/server exec vitest run src/index.test.ts`
Expected: FAIL — cannot find module `./index` (or `startServer` not exported).

- [ ] **Step 3: Implement `src/index.ts`**

```ts
import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { InMemoryRoomStore } from './roomStore';
import { RoomManager } from './roomManager';
import { attachSocketServer } from './socketServer';
import { DEFAULT_CONFIG } from './config';
import type { ClientToServerEvents, ServerToClientEvents } from './types';

export interface RunningServer {
  http: HttpServer;
  port: number;
  stop: () => Promise<void>;
}

export async function startServer(port = Number(process.env.PORT ?? 3001)): Promise<RunningServer> {
  const http = createServer();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
    cors: { origin: '*' },
  });
  const store = new InMemoryRoomStore();
  const manager = new RoomManager(store, DEFAULT_CONFIG);
  attachSocketServer(io, manager, store, DEFAULT_CONFIG);

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const actualPort = (http.address() as { port: number }).port;

  const stop = async (): Promise<void> => {
    io.close();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  };

  return { http, port: actualPort, stop };
}

// Boot when run directly (tsx src/index.ts).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  startServer()
    .then(({ port }) => console.log(`[vobo] server listening on :${port}`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
```

> Note on CORS: `origin: '*'` is fine for local dev and the web client (Plan 3). Tighten to the real web origin before any public deployment.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/server exec vitest run src/index.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Run the FULL server suite + typecheck**

Run: `pnpm --filter @vobo/server test`
Then: `pnpm --filter @vobo/server typecheck`
Expected: all test files PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/index.ts apps/server/src/index.test.ts
git commit -m "feat(server): startable entry point (http + socket.io)"
```

---

## Deferred (out of scope for this plan; noted so nothing is silently dropped)

- **Smart bot-takeover on disconnect:** the spec's "after 20s a bot plays for the disconnected player." Here, a disconnected/idle player's turns are auto-played by the **turn-timeout random call** (`autoCall` every `turnMs`), and `resume` reclaims the seat. Swapping to a *smart* bot after a grace period is a small addition (start a per-seat grace timer on `disconnect` that sets `player.isBot = true`, reset on `resume`) — deferred.
- **Idle-room reaper:** rooms are deleted only when the last human seat leaves. A timer that reaps rooms with zero connected humans after N minutes is deferred.
- **Redis-backed `RoomStore` + Socket.IO Redis adapter** for horizontal scaling — the `RoomStore` interface already isolates this.
- **Rate limiting / abuse protection** on socket events.

---

## Self-Review

**Spec coverage (§4 server):**
- In-memory rooms via `RoomStore` (interface + `InMemoryRoomStore`) → Tasks 4, 2 ✅
- Room code 6 chars, no ambiguous letters → Task 5 ✅
- Guest + room code identity with token for reconnect → Tasks 3, 6, 10 ✅
- Room lifecycle lobby→setup→playing→finished (lobby = no engine state; rest = engine phase) → Tasks 7–9, snapshot in Task 11 ✅
- Authoritative moves via `bingoModule.validateMove`/`applyMove` → Task 8 ✅
- Per-player `room:state` snapshot after every change; opponents hidden → Task 11 (+ Task 12 assertion) ✅
- Socket protocol (create/join/resume/addBot/fillCard/ready/start/call/leave; state/finished/error) → Tasks 2, 11 ✅
- Turn timeout (20s) auto-call → Tasks 9, 11 ✅
- Bot pacing (~1–1.5s) and bot turns → Tasks 9, 11 ✅
- 2–6 players, min 2 to start, host-only addBot/start, host transfer → Tasks 6, 7, 10 ✅
- Reconnect via token; leave→bot; delete room when empty → Task 10 ✅
- End-to-end integration test of a full game → Task 12 ✅

**Placeholder scan:** No TBD/TODO. Forward-referenced imports are handled explicitly (Task 6 pins its import list; Tasks 7 & 9 widen it) — not placeholders.

**Type consistency:** `OpResult<T>` shape is uniform across all RoomManager methods; `fail()` returns the `{ok:false}` variant assignable to any `OpResult<T>`. `RoomSnapshot`/`RosterEntry`/event maps in `types.ts` match their use in `socketServer.ts`. Manager method names (`createRoom`, `joinRoom`, `addBot`, `startGame`, `fillCard`, `setReady`, `callNumber`, `currentPlayer`, `botCall`, `autoCall`, `leave`, `resume`, `attachSocket`, `markDisconnected`) are used consistently by `socketServer.ts`. Engine calls match the real API (`createInitialState(players, rng)`, `botMove(view, difficulty, rng)`, `projectStateFor(state, id)`).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-13-vobo-server.md`. This is **Plan 2 of 3**; Plan 3 (web) will be written once the server exists.

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.

**2. Inline Execution** — execute in this session with checkpoints.

Which approach?
