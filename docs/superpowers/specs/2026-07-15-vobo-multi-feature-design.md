# Vobo Multi-Feature Design

> Date: 2026-07-15
> Status: Draft

## Overview

Six features implemented together:

1. **Responsive mobile** — full mobile-first layout
2. **Chat always open** — fixed right panel, no toggle
3. **Bot replacement** — disconnected players become bots with "(Bot)" suffix
4. **Duplicate names** — auto-suffix on name collision
5. **Interaction system** — throw items/emoji at players with effects + sound
6. **Grid modes** — 5x5, 6x6, 7x7 selectable at room creation

---

## Feature 1: Responsive Mobile

### Breakpoints
- **`< 768px`** (mobile): vertical stack layout
- **`>= 768px`** (desktop): current side-panel layout

### Mobile Layout (< 768px)

```
┌──────────────────┐
│   Player Carousel │ (narrow, compact tiles)
├──────────────────┤
│                  │
│   Game Board     │ (full width, squares)
│                  │
├──────────────────┤
│  [Chat button]   │ (floating, opens bottom sheet)
└──────────────────┘
```

### Mobile-specific changes per component

| Component | Desktop | Mobile |
|-----------|---------|--------|
| `RoomView` | Sidebar + Game + Chat panel | Stack vertical, no sidebar |
| `PlayerCarousel` | Horizontal slider | Compact tiles, smaller |
| `GameBoard` | Fixed max-w-sm | Full width, auto-scale |
| `ChatPanel` | Fixed right w-72 | Bottom sheet (60vh), open via floating button |
| `CardEditor` | Centered max-w-sm | Full width, smaller inputs |
| `Lobby` | Centered card | Full width |
| `Leaderboard` | Fixed left sidebar | Hidden (accessible via button or inside lobby) |
| `ResultOverlay` | Centered overlay | Full-width overlay |

### Chat Bottom Sheet (mobile)
- Floating 💬 button at `fixed right-3 bottom-3 z-50`
- Panel slides up from bottom, height ~60vh
- Drag handle at top
- Backdrop overlay behind
- Same content as desktop chat

---

## Feature 2: Chat Always Open (Desktop)

- Remove toggle state (`isOpen`/`setIsOpen`) from `ChatPanel`
- Panel always visible: `fixed right-0 top-0 h-full w-72`
- Remove close button (✕) and floating toggle button
- Remove unread badge tracking (always visible, no need)
- Mobile keeps toggle behavior (bottom sheet)

### Implementation
- `ChatPanel.tsx`: remove `isOpen` state, always render panel on desktop
- Use `useMediaQuery` or CSS `hidden md:block` to differentiate

---

## Feature 3: Bot Replacement

### Current behavior
- Player disconnects -> 30s grace -> `leave()` called
- In `leave()` (`roomManager.ts:199-200`): `p.isBot = true`, but name stays

### New behavior
- Player disconnects -> 30s grace -> `leave()` called
- In `leave()`: `p.name = p.name + ' (Bot)'`, `p.isBot = true`, `p.botDifficulty = 'medium'`
- Bot is auto-ready (`ready: true` in state)

### Changes
- `apps/server/src/roomManager.ts`: update `leave()` to rename
- If name already ends with "(Bot)", don't double-suffix

---

## Feature 4: Duplicate Names

### New behavior
- When `joinRoom` or `createRoom`, check roster for existing name
- If duplicate: append ` (2)`, ` (3)`, etc. until unique
- Server sends warning flag in ack: `{ ok: true, nameChanged: true, newName }`
- Client shows toast: "Tên bị trùng, đã đổi thành {newName}"

### Changes
- `apps/server/src/roomManager.ts`: `joinRoom()` name dedup
- `apps/web/lib/socket.tsx`: handle `nameChanged` in join ack
- `apps/web/app/page.tsx`: show toast on name change

---

## Feature 5: Interaction System

### Interaction Types

| Type | ID | Icon | Effect | Sound |
|------|----|------|--------|-------|
| Throw tomato | `tomato` | 🍅 | Tomato splat on avatar | splat.mp3 |
| Give flower | `flower` | 💐 | Flowers float up | chime.mp3 |
| Throw brick | `brick` | 🧱 | Brick hit + shake | thud.mp3 |
| Smoke bomb | `smoke` | 💨 | Smoke cloud on avatar | poof.mp3 |
| Chicken | `chicken` | 🐔 | Chicken emoji + text "Con gà!" | cluck.mp3 |
| Hurry up | `hurry` | ⏩ | Speed lines + text "Nhanh lên!" | tick.mp3 |
| Young | `young` | 👶 | Baby emoji + text "Tuổi non!" | laugh.mp3 |
| Fire | `fire` | 🔥 | Fire effect + text | burn.mp3 |
| Heart | `heart` | ❤️ | Heart float | pop.mp3 |
| Laugh | `laugh` | 😂 | Laugh emoji float | pop.mp3 |
| Angry | `angry` | 😡 | Angry emoji float | pop.mp3 |
| Thumbs up | `like` | 👍 | Thumbs up float | pop.mp3 |
| Celebrate | `clap` | 🎉 | Confetti burst | pop.mp3 |

### Trigger
- **Desktop**: Right-click on player tile in `PlayerCarousel` -> context menu
- **Mobile**: Long-press (500ms) on player tile -> action sheet
- **"All" button**: "Gửi tất cả" option in menu -> sends to all other players

### Menu UI
- Grid of interaction icons (3-4 columns)
- Click/tap to select and send
- Menu closes on selection

### Animation Flow
1. Icon spawns at sender's tile position
2. Flies across screen to target's tile (GSAP `motionPath` or `x,y` tween)
3. On arrival: target's tile plays effect animation (shake, flash, splat)
4. Text bubble appears above target (if text interaction)
5. Sound plays via HTML5 Audio or Web Audio API

### Server Protocol
- **Event**: `interaction:send` 
  - Client -> Server: `{ targetPlayerId: string, type: InteractionType }`
  - Server validates (sender + target in same room, game is active)
  - Server broadcasts: `interaction:receive` 
    - `{ fromId, fromName, targetId, type }`
- **All variant**: `{ targetPlayerId: '*', type }` -> server sends to all other players

### Sound Strategy
- Sound files stored in `apps/web/public/sounds/`
- Load on-demand with HTML5 Audio
- Preload common sounds via `new Audio()` on mount
- Respect user mute preference (future enhancement)

---

## Feature 6: Grid Modes (5x5 / 6x6 / 7x7)

### Engine Changes (`packages/game-engine`)

#### Types (`src/bingo/types.ts`)
```typescript
export type GridSize = 5 | 6 | 7;

interface BingoState {
  gridSize: GridSize;  // NEW
  // ... existing fields
}
```

#### Winning Lines (`src/bingo/lines.ts`)
- Generate dynamically based on `gridSize`:
  - N rows + N columns + 2 diagonals = `2N + 2` lines
  - Line indices from 0 to `gridSize*gridSize - 1`
- `getWinningLines(gridSize: GridSize): number[][]`

#### State (`src/bingo/state.ts`)
- `createInitialState(players, rng, opts?)`: accept `gridSize` in opts, default `5`
- Card size = `gridSize * gridSize`
- Numbers from 1 to `gridSize * gridSize`

#### Rules (`src/bingo/rules.ts`)
- `countCompletedLines(card, calledSet, gridSize)`: cap at `gridSize`
- Win condition: `completedLines >= gridSize`

#### Setup (`src/bingo/setup.ts`)
- `isValidCard(card, gridSize)`: validate correct length and numbers
- `randomCard(rng, gridSize)`: generate random card for N*N size

#### BINGO Letters
```typescript
export function getBingoLetters(gridSize: GridSize): string[] {
  const base = ['B', 'I', 'N', 'G', 'O'];
  if (gridSize === 5) return base;
  // Add extra 'O's
  return [...base, ...Array(gridSize - 5).fill('O')];
  // 5: BINGO, 6: BINGOO, 7: BINGOOO
}
```

#### Card Validation
- `isValidCard(card, gridSize)`: checks length = `gridSize * gridSize`, numbers are 1 to `gridSize*gridSize`, no duplicates

### Server Changes (`apps/server`)

#### Types (`src/types.ts`)
- `Room`: add `gridSize: GridSize` field
- `RoomSnapshot`: add `gridSize: GridSize`
- `room:create` event: add optional `gridSize` parameter

#### RoomManager (`src/roomManager.ts`)
- `createRoom(name, turnMs?, gridSize?)`: accept gridSize, default 5, store in room
- Pass `gridSize` to `createInitialState`

#### SocketServer (`src/socketServer.ts`)
- `room:create` handler: extract `gridSize` from client, default 5
- `snapshotFor`: include `gridSize` in snapshot
- Winning line count in game end logic: `gridSize` lines needed (was hardcoded 5)

### Web Changes (`apps/web`)

#### Types (`lib/types.ts`)
- `RoomSnapshot`: add `gridSize: number`

#### Landing Page (`app/page.tsx`)
- Add grid size selector when creating room:
  - 3 buttons/toggle: "5x5" | "6x6" | "7x7"
  - Default: "5x5"
- Pass `gridSize` to `createRoom()`

#### Bingo Helpers (`lib/bingo.ts`)
- `BINGO_LETTERS`: dynamic based on gridSize
- `LINES`: dynamic generation
- `cardRows(card, gridSize)`: adapt to N columns
- `isValidArrangement(cells, gridSize)`: adapt validation

#### CardEditor (`components/CardEditor.tsx`)
- Grid adapts to gridSize: `grid-cols-5`, `grid-cols-6`, `grid-cols-7`
- Number range: 1 to `gridSize*gridSize`
- Random arrangement: use `gridSize`

#### GameBoard (`components/GameBoard.tsx`)
- Letter header: dynamic B-I-N-G-O-O(-O)...
- Grid: `grid-cols-5/6/7`
- Line checking: uses dynamic lines

#### Room List (`components/RoomList.tsx`)
- Show mode: "5x5" / "6x6" / "7x7"

#### Lobby (`components/Lobby.tsx`)
- Show current mode

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `packages/game-engine/src/bingo/types.ts` | Add `GridSize`, update `BingoState` |
| `packages/game-engine/src/bingo/state.ts` | Accept `gridSize` param |
| `packages/game-engine/src/bingo/lines.ts` | Dynamic line generation |
| `packages/game-engine/src/bingo/setup.ts` | `gridSize` in card validation/gen |
| `packages/game-engine/src/bingo/rules.ts` | Dynamic win threshold |
| `packages/game-engine/src/bingo/validate.ts` | Adapt to dynamic grid |
| `packages/game-engine/src/bingo/apply.ts` | Pass gridSize through |
| `packages/game-engine/src/bingo/project.ts` | Include gridSize in view |
| `packages/game-engine/src/bingo/bot.ts` | Adapt to dynamic grid |
| `packages/game-engine/src/bingo/index.ts` | Pass gridSize |
| `packages/game-engine/src/engine.ts` | Update `GameModule` signature (opts) |
| `apps/server/src/types.ts` | Add `gridSize`, interaction events |
| `apps/server/src/roomManager.ts` | Bot rename, name dedup, gridSize |
| `apps/server/src/socketServer.ts` | gridSize + interaction handler |
| `apps/web/lib/types.ts` | Add interaction types, gridSize |
| `apps/web/lib/socket.tsx` | Interaction emit, name dedup |
| `apps/web/lib/bingo.ts` | Dynamic grid helpers |
| `apps/web/app/page.tsx` | Grid size selector, name toast |
| `apps/web/app/globals.css` | Mobile responsive utilities |
| `apps/web/components/RoomView.tsx` | Mobile layout, gridSize pass-through |
| `apps/web/components/PlayerCarousel.tsx` | Right-click/long-press menu |
| `apps/web/components/ChatPanel.tsx` | Always open desktop, bottom sheet mobile |
| `apps/web/components/GameBoard.tsx` | Dynamic grid, GSAP tweak |
| `apps/web/components/CardEditor.tsx` | Dynamic grid |
| `apps/web/components/Lobby.tsx` | Show mode |
| `apps/web/components/RoomList.tsx` | Show mode |
| `apps/web/components/Leaderboard.tsx` | Responsive tweak |
| `apps/web/components/ResultOverlay.tsx` | Responsive tweak |
| `apps/web/components/InteractionMenu.tsx` | **NEW** - interaction picker |
| `apps/web/components/InteractionEffect.tsx` | **NEW** - fly animation + effects |
| `apps/web/public/sounds/*.mp3` | **NEW** - sound files |
| `apps/web/lib/interactions.ts` | **NEW** - interaction definitions |

---

## Testing Strategy

- Game engine: update existing tests for gridSize parameter
- Server: add tests for bot rename, name dedup, gridSize creation
- Web: responsive testing via browser devtools, new interaction component tests
