# Vobo Game Engine (Bingo 5×5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@vobo/game-engine` — a pure, deterministic TypeScript library implementing the game-agnostic `GameModule` interface and the first game (Bingo 5×5 fill-your-own, turn-based calling), fully unit-tested.

**Architecture:** Monorepo (pnpm workspaces + Turborepo). This plan delivers only `packages/game-engine`: no framework, no I/O, no sockets. Every function is pure — `(state, move) → new state` — with randomness supplied by an injected seeded RNG so all behavior is deterministic and testable without a server. The server (plan 2) and web UI (plan 3) consume this package.

**Tech Stack:** TypeScript (strict), pnpm, Turborepo, Vitest.

**Scope note (refines spec §3):** The spec's `Phase` enum listed `'lobby'`. Lobby (players joining, host adding bots) is a **room/server concept**, not a game-engine concept — the engine instance is only created when the host starts the game. So the engine's `GamePhase` is `'setup' | 'playing' | 'finished'`; the server (plan 2) tracks its own room `status` including lobby.

---

## File Structure

```
vobo/
├─ package.json                       # root, private, workspace scripts
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json
└─ packages/game-engine/
   ├─ package.json                    # @vobo/game-engine
   ├─ tsconfig.json
   ├─ vitest.config.ts
   └─ src/
      ├─ index.ts                     # public exports + bingoModule
      ├─ types.ts                     # PlayerSeat, Result, Rng, Difficulty
      ├─ engine.ts                    # GameModule<S,M,V> interface + GameEnd
      ├─ rng.ts                       # createRng (seeded, deterministic)
      └─ bingo/
         ├─ types.ts                  # BingoState, BingoPlayer, BingoMove, BingoView, GamePhase
         ├─ lines.ts                  # LINES: the 12 winning lines
         ├─ setup.ts                  # isValidCard, randomCard
         ├─ rules.ts                  # markedMask, countCompletedLines
         ├─ state.ts                  # createInitialState
         ├─ validate.ts               # validateMove
         ├─ apply.ts                  # applyMove (+ resolveWinner), checkGameEnd
         ├─ project.ts                # projectStateFor
         └─ bot.ts                    # botMove (easy/medium/hard)
```

Each file has one responsibility. Tests are colocated as `*.test.ts` next to the file under test.

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "vobo",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "build": "turbo run build"
  },
  "devDependencies": {
    "turbo": "^2.1.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 3: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "test": {},
    "typecheck": {},
    "lint": {},
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] }
  }
}
```

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 5: Install and verify**

Run: `pnpm install`
Expected: completes, creates `pnpm-lock.yaml` and `node_modules/` (turbo + typescript installed). No workspace packages yet — that's fine.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json pnpm-lock.yaml
git commit -m "chore: scaffold pnpm + turborepo monorepo"
```

---

## Task 2: game-engine package + Vitest smoke test

**Files:**
- Create: `packages/game-engine/package.json`
- Create: `packages/game-engine/tsconfig.json`
- Create: `packages/game-engine/vitest.config.ts`
- Test: `packages/game-engine/src/smoke.test.ts`

- [ ] **Step 1: Create `packages/game-engine/package.json`**

```json
{
  "name": "@vobo/game-engine",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/game-engine/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "noEmit": true,
    "types": []
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/game-engine/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Write the smoke test** — `packages/game-engine/src/smoke.test.ts`

```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Install and run**

Run: `pnpm install`
Then: `pnpm --filter @vobo/game-engine test`
Expected: 1 passing test.

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine pnpm-lock.yaml
git commit -m "chore: add @vobo/game-engine package with vitest"
```

---

## Task 3: Core shared types and GameModule interface

**Files:**
- Create: `packages/game-engine/src/types.ts`
- Create: `packages/game-engine/src/engine.ts`

No runtime behavior — this is types only. Verification is `typecheck`.

- [ ] **Step 1: Create `src/types.ts`**

```ts
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface PlayerSeat {
  id: string;
  name: string;
  isBot: boolean;
  botDifficulty?: Difficulty;
}

/** Validation result for a proposed move. */
export type Result =
  | { ok: true }
  | { ok: false; code: string; message: string };

/** Injected deterministic RNG. */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}
```

- [ ] **Step 2: Create `src/engine.ts`**

```ts
import type { PlayerSeat, Rng, Result, Difficulty } from './types';

export interface GameEnd {
  finished: boolean;
  winners: string[];
}

/**
 * Game-agnostic module. S = full server state, M = move, V = per-player view.
 * All methods are pure; randomness comes only from the injected Rng.
 */
export interface GameModule<S, M, V> {
  id: string;
  createInitialState(players: PlayerSeat[], rng: Rng): S;
  validateMove(state: S, playerId: string, move: M): Result;
  applyMove(state: S, playerId: string, move: M): S;
  checkGameEnd(state: S): GameEnd;
  botMove(view: V, difficulty: Difficulty, rng: Rng): M;
  projectStateFor(state: S, playerId: string): V;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @vobo/game-engine typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/game-engine/src/types.ts packages/game-engine/src/engine.ts
git commit -m "feat(engine): add shared types and GameModule interface"
```

---

## Task 4: Seeded RNG

**Files:**
- Create: `packages/game-engine/src/rng.ts`
- Test: `packages/game-engine/src/rng.test.ts`

- [ ] **Step 1: Write the failing test** — `src/rng.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it('produces floats in [0, 1)', () => {
    const r = createRng(1);
    for (let i = 0; i < 100; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('int(n) returns integers in [0, n)', () => {
    const r = createRng(7);
    for (let i = 0; i < 100; i++) {
      const x = r.int(5);
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(5);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/rng.test.ts`
Expected: FAIL — cannot find module `./rng`.

- [ ] **Step 3: Implement `src/rng.ts`**

```ts
import type { Rng } from './types';

/** mulberry32 — small, fast, seeded PRNG. Deterministic per seed. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive: number): number => Math.floor(next() * maxExclusive),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/rng.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/rng.ts packages/game-engine/src/rng.test.ts
git commit -m "feat(engine): add seeded deterministic RNG"
```

---

## Task 5: Bingo domain types and winning lines

**Files:**
- Create: `packages/game-engine/src/bingo/types.ts`
- Create: `packages/game-engine/src/bingo/lines.ts`
- Test: `packages/game-engine/src/bingo/lines.test.ts`

- [ ] **Step 1: Create `src/bingo/types.ts`** (types only, no test)

```ts
import type { Difficulty } from '../types';

export type GamePhase = 'setup' | 'playing' | 'finished';

export interface BingoPlayer {
  id: string;
  name: string;
  isBot: boolean;
  botDifficulty?: Difficulty;
  card: number[]; // length 25 once filled; [] before filling
  ready: boolean;
  completedLines: number; // 0..5
  connected: boolean;
}

export interface BingoState {
  phase: GamePhase;
  players: BingoPlayer[];
  turnOrder: string[]; // player ids, calling order
  currentTurn: number; // index into turnOrder
  calledNumbers: number[]; // in call order
  winners: string[]; // exactly one id when finished
}

export type BingoMove =
  | { type: 'FillCard'; card: number[] }
  | { type: 'SetReady' }
  | { type: 'CallNumber'; n: number };

export interface BingoView {
  phase: GamePhase;
  you: {
    id: string;
    card: number[];
    marked: boolean[]; // length 25, aligned with card
    completedLines: number;
    ready: boolean;
  };
  opponents: Array<{
    id: string;
    name: string;
    isBot: boolean;
    completedLines: number;
    connected: boolean;
    ready: boolean;
  }>;
  calledNumbers: number[];
  currentPlayerId: string | null; // whose turn (playing phase), else null
  winners: string[];
}
```

- [ ] **Step 2: Write the failing test** — `src/bingo/lines.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { LINES } from './lines';

describe('LINES', () => {
  it('has 12 lines (5 rows + 5 cols + 2 diagonals)', () => {
    expect(LINES).toHaveLength(12);
  });

  it('each line has 5 cell indices in range 0..24', () => {
    for (const line of LINES) {
      expect(line).toHaveLength(5);
      for (const i of line) {
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThanOrEqual(24);
      }
    }
  });

  it('includes the top row, left column, and main diagonal', () => {
    const asStrings = LINES.map((l) => l.join(','));
    expect(asStrings).toContain('0,1,2,3,4'); // top row
    expect(asStrings).toContain('0,5,10,15,20'); // left column
    expect(asStrings).toContain('0,6,12,18,24'); // main diagonal
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/lines.test.ts`
Expected: FAIL — cannot find module `./lines`.

- [ ] **Step 4: Implement `src/bingo/lines.ts`**

```ts
/** The 12 winning lines as index arrays into a 25-cell (5x5, row-major) card. */
export const LINES: readonly (readonly number[])[] = [
  // rows
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  // columns
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  // diagonals
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/lines.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/src/bingo/types.ts packages/game-engine/src/bingo/lines.ts packages/game-engine/src/bingo/lines.test.ts
git commit -m "feat(bingo): add domain types and winning lines"
```

---

## Task 6: Card validation and random card

**Files:**
- Create: `packages/game-engine/src/bingo/setup.ts`
- Test: `packages/game-engine/src/bingo/setup.test.ts`

- [ ] **Step 1: Write the failing test** — `src/bingo/setup.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { isValidCard, randomCard } from './setup';
import { createRng } from '../rng';

describe('isValidCard', () => {
  it('accepts a permutation of 1..25', () => {
    const card = Array.from({ length: 25 }, (_, i) => i + 1);
    expect(isValidCard(card)).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidCard([1, 2, 3])).toBe(false);
  });

  it('rejects duplicates', () => {
    const card = Array.from({ length: 25 }, (_, i) => i + 1);
    card[24] = card[0]; // duplicate
    expect(isValidCard(card)).toBe(false);
  });

  it('rejects out-of-range numbers', () => {
    const card = Array.from({ length: 25 }, (_, i) => i + 1);
    card[0] = 26;
    expect(isValidCard(card)).toBe(false);
  });
});

describe('randomCard', () => {
  it('produces a valid card', () => {
    expect(isValidCard(randomCard(createRng(1)))).toBe(true);
  });

  it('is deterministic per seed', () => {
    expect(randomCard(createRng(9))).toEqual(randomCard(createRng(9)));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/setup.test.ts`
Expected: FAIL — cannot find module `./setup`.

- [ ] **Step 3: Implement `src/bingo/setup.ts`**

```ts
import type { Rng } from '../types';

export function isValidCard(card: number[]): boolean {
  if (card.length !== 25) return false;
  const seen = new Set<number>();
  for (const n of card) {
    if (!Number.isInteger(n) || n < 1 || n > 25) return false;
    if (seen.has(n)) return false;
    seen.add(n);
  }
  return true;
}

/** Fisher–Yates shuffle of 1..25 using the injected RNG. */
export function randomCard(rng: Rng): number[] {
  const card = Array.from({ length: 25 }, (_, i) => i + 1);
  for (let i = card.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = card[i]!;
    card[i] = card[j]!;
    card[j] = tmp;
  }
  return card;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/setup.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/bingo/setup.ts packages/game-engine/src/bingo/setup.test.ts
git commit -m "feat(bingo): add card validation and random card"
```

---

## Task 7: Marking and line counting

**Files:**
- Create: `packages/game-engine/src/bingo/rules.ts`
- Test: `packages/game-engine/src/bingo/rules.test.ts`

- [ ] **Step 1: Write the failing test** — `src/bingo/rules.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { markedMask, countCompletedLines } from './rules';

// Card in natural order: cell index i holds number i+1.
const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

describe('markedMask', () => {
  it('marks cells whose number was called', () => {
    const mask = markedMask(ordered, new Set([1, 3]));
    expect(mask[0]).toBe(true); // holds 1
    expect(mask[2]).toBe(true); // holds 3
    expect(mask[1]).toBe(false); // holds 2
  });
});

describe('countCompletedLines', () => {
  it('is 0 when nothing is called', () => {
    expect(countCompletedLines(ordered, new Set())).toBe(0);
  });

  it('counts the top row when 1..5 are called', () => {
    expect(countCompletedLines(ordered, new Set([1, 2, 3, 4, 5]))).toBe(1);
  });

  it('caps at 5 even if more lines complete', () => {
    // all 25 called -> all 12 lines complete -> capped at 5
    const all = new Set(ordered);
    expect(countCompletedLines(ordered, all)).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/rules.test.ts`
Expected: FAIL — cannot find module `./rules`.

- [ ] **Step 3: Implement `src/bingo/rules.ts`**

```ts
import { LINES } from './lines';

/** boolean[25] aligned with the card: true where the cell's number was called. */
export function markedMask(card: number[], called: ReadonlySet<number>): boolean[] {
  return card.map((n) => called.has(n));
}

/** Number of fully-marked winning lines, capped at 5 (the B-I-N-G-O letters). */
export function countCompletedLines(card: number[], called: ReadonlySet<number>): number {
  const marked = markedMask(card, called);
  let count = 0;
  for (const line of LINES) {
    if (line.every((i) => marked[i])) count++;
  }
  return Math.min(count, 5);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/rules.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/bingo/rules.ts packages/game-engine/src/bingo/rules.test.ts
git commit -m "feat(bingo): add marking and line counting"
```

---

## Task 8: createInitialState

**Files:**
- Create: `packages/game-engine/src/bingo/state.ts`
- Test: `packages/game-engine/src/bingo/state.test.ts`

- [ ] **Step 1: Write the failing test** — `src/bingo/state.test.ts`

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
  it('starts in setup phase with empty turn state', () => {
    const s = createInitialState(seats, createRng(1));
    expect(s.phase).toBe('setup');
    expect(s.calledNumbers).toEqual([]);
    expect(s.turnOrder).toEqual([]);
    expect(s.currentTurn).toBe(0);
    expect(s.winners).toEqual([]);
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
Expected: FAIL — cannot find module `./state`.

- [ ] **Step 3: Implement `src/bingo/state.ts`**

```ts
import type { PlayerSeat, Rng } from '../types';
import type { BingoState, BingoPlayer } from './types';
import { randomCard } from './setup';

export function createInitialState(players: PlayerSeat[], rng: Rng): BingoState {
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
  return {
    phase: 'setup',
    players: bingoPlayers,
    turnOrder: [],
    currentTurn: 0,
    calledNumbers: [],
    winners: [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/state.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/bingo/state.ts packages/game-engine/src/bingo/state.test.ts
git commit -m "feat(bingo): add createInitialState"
```

---

## Task 9: validateMove

**Files:**
- Create: `packages/game-engine/src/bingo/validate.ts`
- Test: `packages/game-engine/src/bingo/validate.test.ts`

- [ ] **Step 1: Write the failing test** — `src/bingo/validate.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { validateMove } from './validate';
import type { BingoState } from './types';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

function setupState(): BingoState {
  return {
    phase: 'setup',
    players: [
      { id: 'a', name: 'A', isBot: false, card: [], ready: false, completedLines: 0, connected: true },
      { id: 'b', name: 'B', isBot: false, card: ordered, ready: true, completedLines: 0, connected: true },
    ],
    turnOrder: [],
    currentTurn: 0,
    calledNumbers: [],
    winners: [],
  };
}

function playingState(): BingoState {
  return {
    phase: 'playing',
    players: [
      { id: 'a', name: 'A', isBot: false, card: ordered, ready: true, completedLines: 0, connected: true },
      { id: 'b', name: 'B', isBot: false, card: ordered, ready: true, completedLines: 0, connected: true },
    ],
    turnOrder: ['a', 'b'],
    currentTurn: 0,
    calledNumbers: [7],
    winners: [],
  };
}

describe('validateMove', () => {
  it('rejects unknown player', () => {
    const r = validateMove(setupState(), 'ghost', { type: 'SetReady' });
    expect(r.ok).toBe(false);
  });

  it('accepts a valid FillCard in setup', () => {
    expect(validateMove(setupState(), 'a', { type: 'FillCard', card: ordered }).ok).toBe(true);
  });

  it('rejects an invalid FillCard', () => {
    expect(validateMove(setupState(), 'a', { type: 'FillCard', card: [1, 2] }).ok).toBe(false);
  });

  it('rejects SetReady before a valid card is filled', () => {
    expect(validateMove(setupState(), 'a', { type: 'SetReady' }).ok).toBe(false);
  });

  it('rejects CallNumber when it is not your turn', () => {
    expect(validateMove(playingState(), 'b', { type: 'CallNumber', n: 3 }).ok).toBe(false);
  });

  it('rejects calling an already-called number', () => {
    expect(validateMove(playingState(), 'a', { type: 'CallNumber', n: 7 }).ok).toBe(false);
  });

  it('accepts a valid CallNumber on your turn', () => {
    expect(validateMove(playingState(), 'a', { type: 'CallNumber', n: 3 }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/validate.test.ts`
Expected: FAIL — cannot find module `./validate`.

- [ ] **Step 3: Implement `src/bingo/validate.ts`**

```ts
import type { Result } from '../types';
import type { BingoState, BingoMove } from './types';
import { isValidCard } from './setup';

export function validateMove(state: BingoState, playerId: string, move: BingoMove): Result {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, code: 'no_player', message: 'Không tìm thấy người chơi' };

  switch (move.type) {
    case 'FillCard':
      if (state.phase !== 'setup')
        return { ok: false, code: 'bad_phase', message: 'Chỉ điền vé ở giai đoạn setup' };
      if (!isValidCard(move.card))
        return { ok: false, code: 'invalid_card', message: 'Vé phải gồm đủ số 1–25, không trùng' };
      return { ok: true };

    case 'SetReady':
      if (state.phase !== 'setup')
        return { ok: false, code: 'bad_phase', message: 'Chỉ sẵn sàng ở giai đoạn setup' };
      if (!isValidCard(player.card))
        return { ok: false, code: 'card_incomplete', message: 'Phải điền vé hợp lệ trước' };
      return { ok: true };

    case 'CallNumber':
      if (state.phase !== 'playing')
        return { ok: false, code: 'bad_phase', message: 'Chưa tới lượt chơi' };
      if (state.turnOrder[state.currentTurn] !== playerId)
        return { ok: false, code: 'not_your_turn', message: 'Chưa tới lượt bạn' };
      if (!Number.isInteger(move.n) || move.n < 1 || move.n > 25)
        return { ok: false, code: 'bad_number', message: 'Số phải trong 1–25' };
      if (state.calledNumbers.includes(move.n))
        return { ok: false, code: 'already_called', message: 'Số này đã được hô' };
      return { ok: true };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/validate.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/bingo/validate.ts packages/game-engine/src/bingo/validate.test.ts
git commit -m "feat(bingo): add validateMove"
```

---

## Task 10: applyMove — FillCard, SetReady, and transition to playing

**Files:**
- Create: `packages/game-engine/src/bingo/apply.ts`
- Test: `packages/game-engine/src/bingo/apply.setup.test.ts`

This task implements `applyMove` for the setup-phase moves and the transition into `playing`. `CallNumber` handling is added in Task 11 (same file).

- [ ] **Step 1: Write the failing test** — `src/bingo/apply.setup.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { applyMove } from './apply';
import type { BingoState } from './types';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

function twoHumanSetup(): BingoState {
  return {
    phase: 'setup',
    players: [
      { id: 'a', name: 'A', isBot: false, card: [], ready: false, completedLines: 0, connected: true },
      { id: 'b', name: 'B', isBot: false, card: [], ready: false, completedLines: 0, connected: true },
    ],
    turnOrder: [],
    currentTurn: 0,
    calledNumbers: [],
    winners: [],
  };
}

describe('applyMove (setup)', () => {
  it('FillCard sets the player card without mutating the input state', () => {
    const s0 = twoHumanSetup();
    const s1 = applyMove(s0, 'a', { type: 'FillCard', card: ordered });
    expect(s1.players.find((p) => p.id === 'a')!.card).toEqual(ordered);
    expect(s0.players.find((p) => p.id === 'a')!.card).toEqual([]); // immutable
  });

  it('SetReady flips ready but stays in setup until everyone is ready', () => {
    let s = twoHumanSetup();
    s = applyMove(s, 'a', { type: 'FillCard', card: ordered });
    s = applyMove(s, 'a', { type: 'SetReady' });
    expect(s.phase).toBe('setup');
    expect(s.players.find((p) => p.id === 'a')!.ready).toBe(true);
  });

  it('transitions to playing when the last player readies, seeding turnOrder', () => {
    let s = twoHumanSetup();
    s = applyMove(s, 'a', { type: 'FillCard', card: ordered });
    s = applyMove(s, 'a', { type: 'SetReady' });
    s = applyMove(s, 'b', { type: 'FillCard', card: ordered });
    s = applyMove(s, 'b', { type: 'SetReady' });
    expect(s.phase).toBe('playing');
    expect(s.turnOrder).toEqual(['a', 'b']);
    expect(s.currentTurn).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/apply.setup.test.ts`
Expected: FAIL — cannot find module `./apply`.

- [ ] **Step 3: Implement `src/bingo/apply.ts`** (setup portion; CallNumber added next task)

```ts
import type { BingoState, BingoMove } from './types';

export function applyMove(state: BingoState, playerId: string, move: BingoMove): BingoState {
  switch (move.type) {
    case 'FillCard':
      return fillCard(state, playerId, move.card);
    case 'SetReady':
      return setReady(state, playerId);
    case 'CallNumber':
      // Implemented in Task 11.
      throw new Error('CallNumber not implemented yet');
  }
}

function fillCard(state: BingoState, playerId: string, card: number[]): BingoState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, card: [...card] } : p)),
  };
}

function setReady(state: BingoState, playerId: string): BingoState {
  const players = state.players.map((p) => (p.id === playerId ? { ...p, ready: true } : p));
  const allReady = players.every((p) => p.ready);
  if (!allReady) return { ...state, players };
  return {
    ...state,
    players,
    phase: 'playing',
    turnOrder: players.map((p) => p.id),
    currentTurn: 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/apply.setup.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/bingo/apply.ts packages/game-engine/src/bingo/apply.setup.test.ts
git commit -m "feat(bingo): apply FillCard/SetReady and transition to playing"
```

---

## Task 11: applyMove — CallNumber, winner resolution, checkGameEnd

**Files:**
- Modify: `packages/game-engine/src/bingo/apply.ts`
- Test: `packages/game-engine/src/bingo/apply.call.test.ts`

Implements calling a number: mark it for everyone, recompute completed lines, detect a win with **caller-priority tie-break** (spec §3), otherwise advance the turn. Also adds `checkGameEnd`.

- [ ] **Step 1: Write the failing test** — `src/bingo/apply.call.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { applyMove, checkGameEnd } from './apply';
import type { BingoState, BingoPlayer } from './types';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

function player(id: string, card: number[], overrides: Partial<BingoPlayer> = {}): BingoPlayer {
  return { id, name: id.toUpperCase(), isBot: false, card, ready: true, completedLines: 0, connected: true, ...overrides };
}

// Two players, playing phase. 'a' is on turn. Numbers 1..4 already called (top row minus the 5th cell).
function nearWinState(): BingoState {
  return {
    phase: 'playing',
    players: [player('a', ordered), player('b', ordered)],
    turnOrder: ['a', 'b'],
    currentTurn: 0,
    calledNumbers: [1, 2, 3, 4],
    winners: [],
  };
}

describe('applyMove (CallNumber)', () => {
  it('appends the called number and advances the turn when no one wins', () => {
    const s = applyMove(nearWinState(), 'a', { type: 'CallNumber', n: 6 });
    expect(s.calledNumbers).toContain(6);
    expect(s.phase).toBe('playing');
    expect(s.currentTurn).toBe(1); // now b's turn
  });

  it('recomputes completedLines for all players on each call', () => {
    // calling 5 completes the top row for BOTH players (identical cards)
    const s = applyMove(nearWinState(), 'a', { type: 'CallNumber', n: 5 });
    expect(s.players.find((p) => p.id === 'b')!.completedLines).toBeGreaterThanOrEqual(1);
  });
});

describe('winner resolution (caller-priority)', () => {
  // Build a state where calling one number simultaneously completes the 5th line
  // for both players. Give both players the same card and set them to 4 completed lines,
  // needing only the top row's last cell (number 5).
  function bothAboutToWin(): BingoState {
    // rows 2..5 fully marked already => 4 completed lines each; top row missing only "5"
    const called = [
      6, 7, 8, 9, 10, // row 2
      11, 12, 13, 14, 15, // row 3
      16, 17, 18, 19, 20, // row 4
      21, 22, 23, 24, 25, // row 5
      1, 2, 3, 4, // top row minus 5
    ];
    return {
      phase: 'playing',
      players: [player('a', ordered, { completedLines: 4 }), player('b', ordered, { completedLines: 4 })],
      turnOrder: ['a', 'b'],
      currentTurn: 0, // a is the caller
      calledNumbers: called,
      winners: [],
    };
  }

  it('awards the win to the caller when the caller also reaches 5 lines', () => {
    const s = applyMove(bothAboutToWin(), 'a', { type: 'CallNumber', n: 5 });
    expect(s.phase).toBe('finished');
    expect(s.winners).toEqual(['a']); // caller wins the tie
  });
});

describe('checkGameEnd', () => {
  it('reports finished with winners after a winning call', () => {
    const s = applyMove(nearWinState(), 'a', { type: 'CallNumber', n: 5 });
    // top row completes for caller 'a' (only 1 line) — not a win yet
    expect(checkGameEnd(s)).toEqual({ finished: false, winners: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/apply.call.test.ts`
Expected: FAIL — `CallNumber not implemented yet` (thrown) and `checkGameEnd` is not exported.

- [ ] **Step 3: Update `src/bingo/apply.ts`** — replace the `CallNumber` throw and add the helpers + `checkGameEnd`

Replace the `case 'CallNumber':` line in `applyMove` with:

```ts
    case 'CallNumber':
      return callNumber(state, playerId, move.n);
```

Add these imports at the top of the file:

```ts
import { countCompletedLines } from './rules';
import type { GameEnd } from '../engine';
```

Add these functions at the end of the file:

```ts
function callNumber(state: BingoState, callerId: string, n: number): BingoState {
  const calledNumbers = [...state.calledNumbers, n];
  const called = new Set(calledNumbers);
  const players = state.players.map((p) => ({
    ...p,
    completedLines: countCompletedLines(p.card, called),
  }));

  const winnersSet = players.filter((p) => p.completedLines >= 5).map((p) => p.id);
  if (winnersSet.length > 0) {
    const winnerId = resolveWinner(state.turnOrder, callerId, winnersSet);
    return { ...state, calledNumbers, players, phase: 'finished', winners: [winnerId] };
  }

  const currentTurn = (state.currentTurn + 1) % state.turnOrder.length;
  return { ...state, calledNumbers, players, currentTurn };
}

/**
 * Caller-priority tie-break (spec §3): the caller wins if they reached 5 lines;
 * otherwise the first winner scanning turnOrder forward from the caller.
 */
function resolveWinner(turnOrder: string[], callerId: string, winnersSet: string[]): string {
  if (winnersSet.includes(callerId)) return callerId;
  const start = turnOrder.indexOf(callerId);
  for (let i = 0; i < turnOrder.length; i++) {
    const cand = turnOrder[(start + i) % turnOrder.length]!;
    if (winnersSet.includes(cand)) return cand;
  }
  return winnersSet[0]!; // unreachable when winnersSet is non-empty
}

export function checkGameEnd(state: BingoState): GameEnd {
  return { finished: state.phase === 'finished', winners: state.winners };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/apply.call.test.ts`
Expected: PASS (5 tests). Also re-run the setup test to confirm no regression: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/apply.setup.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/bingo/apply.ts packages/game-engine/src/bingo/apply.call.test.ts
git commit -m "feat(bingo): call numbers, caller-priority win, checkGameEnd"
```

---

## Task 12: projectStateFor (per-player view)

**Files:**
- Create: `packages/game-engine/src/bingo/project.ts`
- Test: `packages/game-engine/src/bingo/project.test.ts`

- [ ] **Step 1: Write the failing test** — `src/bingo/project.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { projectStateFor } from './project';
import type { BingoState } from './types';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

function state(): BingoState {
  return {
    phase: 'playing',
    players: [
      { id: 'a', name: 'A', isBot: false, card: ordered, ready: true, completedLines: 1, connected: true },
      { id: 'b', name: 'B', isBot: true, botDifficulty: 'hard', card: ordered, ready: true, completedLines: 2, connected: true },
    ],
    turnOrder: ['a', 'b'],
    currentTurn: 0,
    calledNumbers: [1, 2, 3],
    winners: [],
  };
}

describe('projectStateFor', () => {
  it('exposes your own full card with a marked mask', () => {
    const v = projectStateFor(state(), 'a');
    expect(v.you.card).toEqual(ordered);
    expect(v.you.marked[0]).toBe(true); // holds 1, called
    expect(v.you.marked[3]).toBe(false); // holds 4, not called
    expect(v.you.completedLines).toBe(1);
  });

  it('HIDES opponents cards, exposing only name and progress', () => {
    const v = projectStateFor(state(), 'a');
    expect(v.opponents).toHaveLength(1);
    const opp = v.opponents[0]!;
    expect(opp.id).toBe('b');
    expect(opp.completedLines).toBe(2);
    // The opponent projection must not carry a card field at all.
    expect((opp as Record<string, unknown>).card).toBeUndefined();
  });

  it('reports whose turn it is during play', () => {
    expect(projectStateFor(state(), 'a').currentPlayerId).toBe('a');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/project.test.ts`
Expected: FAIL — cannot find module `./project`.

- [ ] **Step 3: Implement `src/bingo/project.ts`**

```ts
import type { BingoState, BingoView } from './types';
import { markedMask } from './rules';

export function projectStateFor(state: BingoState, playerId: string): BingoView {
  const you = state.players.find((p) => p.id === playerId);
  if (!you) throw new Error(`player ${playerId} not in state`);

  const called = new Set(state.calledNumbers);
  const opponents = state.players
    .filter((p) => p.id !== playerId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      completedLines: p.completedLines,
      connected: p.connected,
      ready: p.ready,
    }));

  return {
    phase: state.phase,
    you: {
      id: you.id,
      card: [...you.card],
      marked: markedMask(you.card, called),
      completedLines: you.completedLines,
      ready: you.ready,
    },
    opponents,
    calledNumbers: [...state.calledNumbers],
    currentPlayerId: state.phase === 'playing' ? (state.turnOrder[state.currentTurn] ?? null) : null,
    winners: [...state.winners],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/project.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/bingo/project.ts packages/game-engine/src/bingo/project.test.ts
git commit -m "feat(bingo): add projectStateFor with opponent-card hiding"
```

---

## Task 13: Bot move (easy / medium / hard)

**Files:**
- Create: `packages/game-engine/src/bingo/bot.ts`
- Test: `packages/game-engine/src/bingo/bot.test.ts`

The bot receives only its own `BingoView` (no peeking at opponent cards). `easy` calls a random uncalled number; `medium`/`hard` greedily pick the uncalled number that most advances the bot's own lines (`hard` weights near-complete lines more heavily).

- [ ] **Step 1: Write the failing test** — `src/bingo/bot.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { botMove } from './bot';
import { projectStateFor } from './project';
import type { BingoState } from './types';
import { createRng } from '../rng';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

function viewFor(called: number[], completedLines = 0) {
  const s: BingoState = {
    phase: 'playing',
    players: [
      { id: 'bot', name: 'Bot', isBot: true, card: ordered, ready: true, completedLines, connected: true },
      { id: 'x', name: 'X', isBot: false, card: ordered, ready: true, completedLines: 0, connected: true },
    ],
    turnOrder: ['bot', 'x'],
    currentTurn: 0,
    calledNumbers: called,
    winners: [],
  };
  return projectStateFor(s, 'bot');
}

describe('botMove', () => {
  it('easy: returns a valid, uncalled number', () => {
    const move = botMove(viewFor([1, 2, 3]), 'easy', createRng(5));
    expect(move.type).toBe('CallNumber');
    if (move.type === 'CallNumber') {
      expect(move.n).toBeGreaterThanOrEqual(1);
      expect(move.n).toBeLessThanOrEqual(25);
      expect([1, 2, 3]).not.toContain(move.n);
    }
  });

  it('medium: completes a line when one number away', () => {
    // top row 1..5: 1..4 already called; the winning move is to call 5
    const move = botMove(viewFor([1, 2, 3, 4]), 'medium', createRng(1));
    expect(move).toEqual({ type: 'CallNumber', n: 5 });
  });

  it('hard: also completes a line when one number away', () => {
    const move = botMove(viewFor([1, 2, 3, 4]), 'hard', createRng(1));
    expect(move).toEqual({ type: 'CallNumber', n: 5 });
  });

  it('is deterministic given the same view, difficulty, and seed', () => {
    const a = botMove(viewFor([2, 4, 6]), 'easy', createRng(99));
    const b = botMove(viewFor([2, 4, 6]), 'easy', createRng(99));
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/bot.test.ts`
Expected: FAIL — cannot find module `./bot`.

- [ ] **Step 3: Implement `src/bingo/bot.ts`**

```ts
import type { Rng, Difficulty } from '../types';
import type { BingoView, BingoMove } from './types';
import { LINES } from './lines';

export function botMove(view: BingoView, difficulty: Difficulty, rng: Rng): BingoMove {
  const uncalled = uncalledNumbers(view.calledNumbers);
  if (uncalled.length === 0) throw new Error('no numbers left to call');

  if (difficulty === 'easy') {
    return { type: 'CallNumber', n: uncalled[rng.int(uncalled.length)]! };
  }
  return { type: 'CallNumber', n: greedyPick(view.you.card, view.calledNumbers, uncalled, difficulty) };
}

function uncalledNumbers(called: number[]): number[] {
  const set = new Set(called);
  const out: number[] = [];
  for (let n = 1; n <= 25; n++) if (!set.has(n)) out.push(n);
  return out;
}

function greedyPick(card: number[], called: number[], uncalled: number[], difficulty: Difficulty): number {
  const marked = card.map((v) => called.includes(v));
  let best = uncalled[0]!;
  let bestKey: [number, number, number] = [-1, -1, -1];

  for (const n of uncalled) {
    const cell = card.indexOf(n); // the one cell this call would mark on the bot's card
    let completed = 0;
    let progress = 0;
    for (const line of LINES) {
      if (!line.includes(cell)) continue;
      const alreadyMarked = line.filter((c) => c !== cell && marked[c]).length;
      if (alreadyMarked === 4) completed++; // marking `cell` completes this line
      const weight = alreadyMarked + 1;
      progress += difficulty === 'hard' ? weight * weight : weight;
    }
    const key: [number, number, number] = [completed, progress, -n];
    if (compareKey(key, bestKey) > 0) {
      bestKey = key;
      best = n;
    }
  }
  return best;
}

function compareKey(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/game-engine exec vitest run src/bingo/bot.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/game-engine/src/bingo/bot.ts packages/game-engine/src/bingo/bot.test.ts
git commit -m "feat(bingo): add bot move with easy/medium/hard strategies"
```

---

## Task 14: Assemble bingoModule + public exports + full-game integration test

**Files:**
- Create: `packages/game-engine/src/bingo/index.ts`
- Create: `packages/game-engine/src/index.ts`
- Delete: `packages/game-engine/src/smoke.test.ts`
- Test: `packages/game-engine/src/bingo/game.integration.test.ts`

- [ ] **Step 1: Create `src/bingo/index.ts`** — assemble the module

```ts
import type { GameModule } from '../engine';
import type { BingoState, BingoMove, BingoView } from './types';
import { createInitialState } from './state';
import { validateMove } from './validate';
import { applyMove, checkGameEnd } from './apply';
import { botMove } from './bot';
import { projectStateFor } from './project';

export const bingoModule: GameModule<BingoState, BingoMove, BingoView> = {
  id: 'bingo',
  createInitialState,
  validateMove,
  applyMove,
  checkGameEnd,
  botMove,
  projectStateFor,
};

export * from './types';
```

- [ ] **Step 2: Create `src/index.ts`** — public package surface

```ts
export type { GameModule, GameEnd } from './engine';
export type { PlayerSeat, Result, Rng, Difficulty } from './types';
export { createRng } from './rng';
export { bingoModule } from './bingo';
export type { BingoState, BingoPlayer, BingoMove, BingoView, GamePhase } from './bingo/types';
```

- [ ] **Step 3: Delete the smoke test**

Run: `git rm packages/game-engine/src/smoke.test.ts`

- [ ] **Step 4: Write the full-game integration test** — `src/bingo/game.integration.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { bingoModule } from './index';
import { createRng } from '../rng';
import type { PlayerSeat } from '../types';
import type { BingoState, BingoMove } from './types';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

const seats: PlayerSeat[] = [
  { id: 'a', name: 'An', isBot: false },
  { id: 'b', name: 'Bình', isBot: false },
];

// Helper: validate then apply, asserting the move was legal.
function play(state: BingoState, playerId: string, move: BingoMove): BingoState {
  const check = bingoModule.validateMove(state, playerId, move);
  expect(check.ok).toBe(true);
  return bingoModule.applyMove(state, playerId, move);
}

describe('bingoModule (full game)', () => {
  it('plays setup -> playing -> a winner is decided', () => {
    let s = bingoModule.createInitialState(seats, createRng(1));

    // both fill identical ordered cards and ready up
    s = play(s, 'a', { type: 'FillCard', card: ordered });
    s = play(s, 'a', { type: 'SetReady' });
    s = play(s, 'b', { type: 'FillCard', card: ordered });
    s = play(s, 'b', { type: 'SetReady' });
    expect(s.phase).toBe('playing');

    // Drive calls until the game finishes. Each player calls the lowest legal number.
    let guard = 0;
    while (bingoModule.checkGameEnd(s).finished === false) {
      const current = s.turnOrder[s.currentTurn]!;
      const next = [...Array(25)].map((_, i) => i + 1).find((n) => !s.calledNumbers.includes(n))!;
      s = play(s, current, { type: 'CallNumber', n: next });
      if (++guard > 25) throw new Error('game did not terminate');
    }

    const end = bingoModule.checkGameEnd(s);
    expect(end.finished).toBe(true);
    expect(end.winners).toHaveLength(1);
    expect(['a', 'b']).toContain(end.winners[0]);
  });

  it('projects a hidden-opponent view for the winner', () => {
    let s = bingoModule.createInitialState(seats, createRng(2));
    s = play(s, 'a', { type: 'FillCard', card: ordered });
    s = play(s, 'a', { type: 'SetReady' });
    s = play(s, 'b', { type: 'FillCard', card: ordered });
    s = play(s, 'b', { type: 'SetReady' });
    const view = bingoModule.projectStateFor(s, 'a');
    expect(view.opponents[0]!.id).toBe('b');
    expect((view.opponents[0] as Record<string, unknown>).card).toBeUndefined();
  });
});
```

- [ ] **Step 5: Run the full test suite**

Run: `pnpm --filter @vobo/game-engine test`
Expected: all test files PASS, including the new integration test. Then typecheck:
Run: `pnpm --filter @vobo/game-engine typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/game-engine/src/bingo/index.ts packages/game-engine/src/index.ts packages/game-engine/src/bingo/game.integration.test.ts
git commit -m "feat(engine): assemble bingoModule, public exports, full-game test"
```

---

## Self-Review

**Spec coverage (§3 game engine):**
- Game-agnostic `GameModule` interface → Task 3 ✅
- `BingoState` / `BingoPlayer` / `BingoMove` / `BingoView` → Task 5 ✅
- Injected RNG for determinism → Task 4, used in Tasks 8 & 13 ✅
- Marking derived from `calledNumbers`; 12 lines; `completedLines = min(count, 5)` → Task 7 ✅
- Card = permutation of 1..25; validation + random arrange ("Xếp ngẫu nhiên") → Task 6 ✅
- `createInitialState` (bots auto-carded & ready, humans empty) → Task 8 ✅
- `validateMove` (phase, turn, duplicate-number, card validity) → Task 9 ✅
- `applyMove` FillCard/SetReady/transition → Task 10 ✅
- `applyMove` CallNumber + **caller-priority tie-break** + single winner → Task 11 ✅
- `checkGameEnd` → Task 11 ✅
- `projectStateFor` hides opponent cards, exposes only progress → Task 12 ✅
- Fair bot (view-only) with easy/medium/hard → Task 13 ✅
- `bingoModule` implementing the interface → Task 14 ✅
- Testing strategy: TDD, seeded RNG, covers validate/mark/count/win/tie-break/bot/hiding → all tasks ✅

Out of scope for this plan (handled later): server, sockets, timers, reconnect, lobby/room `status`, web UI. These are plans 2 and 3.

**Placeholder scan:** No TBD/TODO. The only forward-reference is Task 10's `CallNumber` throw, which is explicitly replaced in Task 11 (intentional TDD staging, not a placeholder).

**Type consistency check:**
- `Rng` = `{ next(): number; int(maxExclusive): number }` — consistent across rng.ts, setup.ts, bot.ts. ✅
- `GameModule<S, M, V>` method signatures (`createInitialState(players, rng)`, `botMove(view, difficulty, rng)`) match `bingoModule`'s functions. ✅
- `BingoView.you.marked` and `markedMask` both return `boolean[]` length 25. ✅
- `completedLines` capped at 5 everywhere (rules.ts), win condition `>= 5` (apply.ts). ✅
- `winners: string[]` with exactly one element on finish — produced in apply.ts, read in checkGameEnd/project. ✅
- `GamePhase = 'setup' | 'playing' | 'finished'` used consistently (spec's `'lobby'` intentionally deferred to server, noted in header). ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-13-vobo-game-engine.md`. This is **Plan 1 of 3** (engine → server → web); plans 2 and 3 will be written once this layer exists so they reference the real API.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
