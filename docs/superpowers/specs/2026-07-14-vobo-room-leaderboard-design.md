# Vobo Per-Room Win Leaderboard — Design

**Date:** 2026-07-14
**Scope:** `apps/server` (win tally + snapshot) + `apps/web` (leaderboard UI). No engine changes.

## Goal

Track how many games each player has won **within a room's session** and show a
ranked leaderboard in two places: the **waiting room (Lobby)** and the **result
overlay (ResultOverlay)**.

## Non-Goals

- No persistence beyond the in-memory room. The tally lives on the `Room` and dies
  when the room is cleaned up (empty). A player who leaves and rejoins gets a new
  `playerId`, so their prior wins do not carry over — an accepted limitation of the
  in-memory model.
- No leaderboard during active play (only Lobby + ResultOverlay).
- No engine changes.

## Data Model (Server)

### `Room` — `apps/server/src/types.ts`

Add two fields:
```ts
  wins: Record<string, number>; // playerId -> games won this room session
  winRecorded?: boolean;        // guard: the current finished game's win was already counted
```

### `RosterEntry` (server snapshot) — `apps/server/src/types.ts`

Add a **required** `wins`:
```ts
export interface RosterEntry {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  wins: number; // games won this room session
}
```
(`snapshotFor` always sets it, so required is safe — no server fixture builds
`RosterEntry` literals.)

## Server Behavior

### Init — `RoomManager.createRoom` (`apps/server/src/roomManager.ts`)

Initialize the tally on the `Room` literal:
```ts
  wins: {},
```

### Reset the guard on each new game — `RoomManager.startGame`

Alongside the existing `room.rolling = false; room.revealDone = false;`, add:
```ts
  room.winRecorded = false;
```
`wins` itself is **not** reset — it accumulates across games in the room.

### Count the win exactly once — `orchestrate` finished branch (`apps/server/src/socketServer.ts`)

The finished branch runs on every `orchestrate` for a finished room (reconnects,
repeat broadcasts), so counting must be guarded. Where it currently does
`room.lastWinnerId = room.state.winners[0];`, add:
```ts
    room.lastWinnerId = room.state.winners[0];
    if (!room.winRecorded) {
      const w = room.state.winners[0];
      if (w) room.wins[w] = (room.wins[w] ?? 0) + 1;
      room.winRecorded = true;
    }
```

### Preserve across "Chơi lại" — `RoomManager.returnToLobby`

No change needed: `returnToLobby` clears `room.state`/timers but never touches
`room.wins`, so the tally persists into the next lobby automatically. (Winners who
left are dropped from the roster and simply won't appear in the leaderboard; their
count lingers harmlessly in `room.wins`.)

### Surface in the snapshot — `snapshotFor` (`apps/server/src/socketServer.ts`)

The roster map currently builds `{ id, name, isBot, connected }`. Add:
```ts
      wins: room.wins[p.id] ?? 0,
```

## Web

### `RosterEntry` — `apps/web/lib/types.ts`

Add an **optional** `wins` so the many existing test fixtures that build rosters keep
compiling; read sites default it to 0:
```ts
export interface RosterEntry {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  wins?: number; // games won this room session (server always sends it)
}
```

### New component — `apps/web/components/Leaderboard.tsx`

```ts
{ roster: RosterEntry[] }
```
- Renders players ranked by `wins` **descending** (stable sort → ties keep roster
  order). Each row: `#rank · name · 🏆 wins`. Root carries `data-leaderboard`; each
  row carries `data-player={id}` so tests can assert DOM order.
- Reads `entry.wins ?? 0`.
- Pure/presentational — no animation, no socket calls.
- Includes bots (they can win) — they render with their bot name like any player.

### Lobby — `apps/web/components/Lobby.tsx`

Render `<Leaderboard roster={snapshot.roster} />` below the existing roster list,
under a "🏆 Bảng xếp hạng" heading.

### ResultOverlay — `apps/web/components/ResultOverlay.tsx`

Render a compact `<Leaderboard roster={snapshot.roster} />` between the win/lose
message and the buttons, so the just-updated standings are visible.

## Data Flow

Game ends → `orchestrate` finished branch increments `room.wins[winner]` once
(guarded) → `broadcast` pushes fresh snapshots whose `roster[i].wins` reflect the new
totals → Lobby and ResultOverlay render the ranked `Leaderboard`. "Chơi lại" returns
to the lobby with `wins` intact; a new game resets only `winRecorded`.

## Testing & Non-Regression

- **Server (`roomManager` + integration):**
  - `createRoom` initializes `wins = {}`.
  - After a game finishes, `room.wins[winner]` is `1`; a repeat `orchestrate` on the
    still-finished room does **not** double-count (stays `1`).
  - `startGame` resets `winRecorded` (so the next game can count) while keeping `wins`.
  - `returnToLobby` preserves `wins`.
  - `snapshotFor` roster entries carry the correct `wins`.
- **Web (`Leaderboard.test.tsx`):** given a roster with mixed win counts, rows appear
  in descending-wins order (assert the sequence of `data-player`/name), counts shown.
- **Web (`Lobby.test.tsx`, `ResultOverlay.test.tsx`):** each renders a
  `[data-leaderboard]` with the players; add `wins` to those two fixtures to assert
  ordering/counts. The other roster fixtures (PlayerCarousel, TurnReveal, RoomView)
  need no change thanks to the optional `wins`.
- **Gates:** `pnpm --filter @vobo/server test`, `pnpm --filter @vobo/web test`,
  `pnpm --filter @vobo/web typecheck`, `pnpm --filter @vobo/web build`.

## File Structure

- Modify: `apps/server/src/types.ts` — `Room.wins`/`winRecorded`, `RosterEntry.wins`.
- Modify: `apps/server/src/roomManager.ts` — `createRoom` init, `startGame` reset.
- Modify: `apps/server/src/socketServer.ts` — orchestrate increment (guarded), snapshot `wins`.
- Modify: `apps/server/src/*.test.ts` — win-tally coverage (roomManager + integration).
- Modify: `apps/web/lib/types.ts` — `RosterEntry.wins?`.
- Create: `apps/web/components/Leaderboard.tsx`, `apps/web/components/Leaderboard.test.tsx`.
- Modify: `apps/web/components/Lobby.tsx` + `Lobby.test.tsx` — render + assert leaderboard.
- Modify: `apps/web/components/ResultOverlay.tsx` + `ResultOverlay.test.tsx` — render + assert.

## Risk

- Low. Additive server field with a one-shot guard (the only real correctness point is
  not double-counting — covered by a test). Web is a small presentational component
  plumbed into two existing views.
