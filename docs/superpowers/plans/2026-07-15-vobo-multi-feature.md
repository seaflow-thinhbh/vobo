# Vobo Multi-Feature Implementation Plan

> **Goal:** Implement responsive mobile, always-open chat, bot rename, name dedup, interaction system, grid modes (5x5/6x6/7x7), and card swap popup.

**Architecture:** Bottom-up: game engine first (gridSize support), then server (types + events), finally web (all UI changes). Two new web components: InteractionMenu + InteractionEffect.

**Tech Stack:** TypeScript 5.6, Next.js 15, React 19, Socket.IO, GSAP 3.x, Tailwind CSS 3.4, Web Audio API

## Global Constraints
- Grid sizes: 5, 6, 7 (default 5)
- Numbers range: 1 to gridSize*gridSize
- Win condition: completedLines >= gridSize
- BINGO word: B-I-N-G-O + extra O's for >5
- Bot replacement: name becomes "{original} (Bot)"
- Name dedup: suffix " (2)", " (3)" etc.
- Chat: always open on desktop (>=768px), bottom sheet on mobile (<768px)
- Interaction: right-click desktop / long-press mobile on player tiles
- Card swap: popup on duplicate entry

---

### Task 1: Game Engine — gridSize support

**Files:**
- Modify: `packages/game-engine/src/bingo/types.ts`
- Modify: `packages/game-engine/src/bingo/lines.ts`
- Modify: `packages/game-engine/src/bingo/state.ts`
- Modify: `packages/game-engine/src/bingo/setup.ts`
- Modify: `packages/game-engine/src/bingo/rules.ts`
- Modify: `packages/game-engine/src/bingo/validate.ts`
- Modify: `packages/game-engine/src/bingo/apply.ts`
- Modify: `packages/game-engine/src/bingo/project.ts`
- Modify: `packages/game-engine/src/bingo/bot.ts`
- Modify: `packages/game-engine/src/engine.ts`

**Interfaces:**
- Produces: `GridSize = 5 | 6 | 7`, `BingoState.gridSize`, `getWinningLines(gridSize)`, updated function signatures accepting gridSize

- [ ] **Step 1: Add GridSize type and gridSize field to BingoState, BingoView**

In `types.ts`:
```typescript
export type GridSize = 5 | 6 | 7;

export interface BingoState {
  gridSize: GridSize;
  // ... existing fields unchanged
}
```

In `BingoView.you`, add `gridSize: GridSize`. Add to `BingoView`: `gridSize: GridSize`.

- [ ] **Step 2: Dynamic line generation in lines.ts**

Replace hardcoded LINES with:
```typescript
export function getWinningLines(gridSize: GridSize): number[][] {
  const N = gridSize;
  const total = N * N;
  const lines: number[][] = [];
  // rows
  for (let r = 0; r < N; r++) {
    const row: number[] = [];
    for (let c = 0; c < N; c++) row.push(r * N + c);
    lines.push(row);
  }
  // columns
  for (let c = 0; c < N; c++) {
    const col: number[] = [];
    for (let r = 0; r < N; r++) col.push(r * N + c);
    lines.push(col);
  }
  // main diagonal
  const diag1: number[] = [];
  for (let i = 0; i < N; i++) diag1.push(i * N + i);
  lines.push(diag1);
  // anti-diagonal
  const diag2: number[] = [];
  for (let i = 0; i < N; i++) diag2.push(i * N + (N - 1 - i));
  lines.push(diag2);
  return lines;
}

// Keep static LINES for backward compat (5x5)
export const LINES: readonly (readonly number[])[] = getWinningLines(5).map(l => [...l]);
```

- [ ] **Step 3: Update state.ts — accept gridSize**

```typescript
export function createInitialState(
  players: PlayerSeat[],
  rng: Rng,
  opts?: { firstPlayerId?: string; gridSize?: GridSize },
): BingoState {
  const gridSize = opts?.gridSize ?? 5;
  // ... card gen must use gridSize
  // bot card: randomCard(rng, gridSize)
  // human card: []
}
```

- [ ] **Step 4: Update setup.ts — gridSize param on isValidCard + randomCard**

```typescript
export function isValidCard(card: number[], gridSize: GridSize = 5): boolean {
  const total = gridSize * gridSize;
  if (card.length !== total) return false;
  const seen = new Set<number>();
  for (const n of card) {
    if (!Number.isInteger(n) || n < 1 || n > total) return false;
    if (seen.has(n)) return false;
    seen.add(n);
  }
  return true;
}

export function randomCard(rng: Rng, gridSize: GridSize = 5): number[] {
  const total = gridSize * gridSize;
  const card = Array.from({ length: total }, (_, i) => i + 1);
  // Fisher-Yates shuffle
  for (let i = card.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = card[i]!;
    card[i] = card[j]!;
    card[j] = tmp;
  }
  return card;
}
```

- [ ] **Step 5: Update rules.ts — gridSize param**

```typescript
export function countCompletedLines(card: number[], called: ReadonlySet<number>, gridSize: GridSize = 5): number {
  const marked = markedMask(card, called);
  const lines = getWinningLines(gridSize);
  let count = 0;
  for (const line of lines) {
    if (line.every((i) => marked[i])) count++;
  }
  return Math.min(count, gridSize);
}
```

- [ ] **Step 6: Update validate.ts — use gridSize**

In `validateMove`, use `state.gridSize` for number range checks (`move.n < 1 || move.n > state.gridSize * state.gridSize`), pass `state.gridSize` to `isValidCard`.

- [ ] **Step 7: Update apply.ts — use gridSize for win check**

Change `p.completedLines >= 5` to `p.completedLines >= state.gridSize` in `callNumber`.

- [ ] **Step 8: Update project.ts — include gridSize in view**

Add `gridSize: state.gridSize` to BingoView.

- [ ] **Step 9: Update bot.ts — use dynamic line count**

In `uncalledNumbers`, loop to `gridSize * gridSize` (need gridSize param or derive from view). Accept gridSize from view.

- [ ] **Step 10: Update engine.ts interface**

Update `createInitialState` opts type to include `gridSize?: number`.

### Task 2: Server — gridSize + bot rename + name dedup + interaction events

**Files:**
- Modify: `apps/server/src/types.ts`
- Modify: `apps/server/src/roomManager.ts`
- Modify: `apps/server/src/socketServer.ts`

- [ ] Integrate all server-side changes for gridSize, bot rename, name dedup, interaction socket events.

### Task 3: Web — types, bingo helpers, socket

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/bingo.ts`
- Modify: `apps/web/lib/socket.tsx`
- Create: `apps/web/lib/interactions.ts`

- [ ] Update all type definitions and helper functions for gridSize + interactions.

### Task 4: Web — Interaction system

**Files:**
- Create: `apps/web/components/InteractionMenu.tsx`
- Create: `apps/web/components/InteractionEffect.tsx`
- Create: `apps/web/public/sounds/` (placeholders)

- [ ] Build interaction menu and animation components.

### Task 5: Web — ChatPanel always open + Responsive

**Files:**
- Modify: `apps/web/components/ChatPanel.tsx`
- Modify: `apps/web/components/RoomView.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] Remove toggle, make always open on desktop, bottom sheet on mobile.

### Task 6: Web — CardEditor swap popup + gridSize

**Files:**
- Modify: `apps/web/components/CardEditor.tsx`

- [ ] Add duplicate swap confirmation popup, dynamic gridSize.

### Task 7: Web — GameBoard + PlayerCarousel + Rest gridSize

**Files:**
- Modify: `apps/web/components/GameBoard.tsx`
- Modify: `apps/web/components/PlayerCarousel.tsx`

- [ ] Dynamic grid rendering, right-click/long-press interaction trigger.

### Task 8: Web — Landing/Lobby/RoomList gridSize selector

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/components/Lobby.tsx`
- Modify: `apps/web/components/RoomList.tsx`

- [ ] Add grid size selector to room creation, show mode in list/lobby.

### Task 9: Verify

- [ ] Run typecheck, tests, build
